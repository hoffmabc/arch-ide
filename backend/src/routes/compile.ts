import * as dotenv from 'dotenv';
dotenv.config();
import { HttpFunction } from '@google-cloud/functions-framework';
import { Storage } from '@google-cloud/storage';
import { Request, Response, Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { CloudBuildClient } from '@google-cloud/cloudbuild';
import { protos } from '@google-cloud/cloudbuild';
import * as tar from 'tar';
import * as os from 'os';
type IBuild = protos.google.devtools.cloudbuild.v1.IBuild;

const execAsync = promisify(exec);
const storage = new Storage();
const BUCKET_NAME = 'arch-compiler-artifacts';
const cloudbuild = new CloudBuildClient();

console.log('Environment variables:', {
  PROJECT_ID: process.env.PROJECT_ID,
  NODE_ENV: process.env.NODE_ENV,
  PWD: process.env.PWD
});

console.log('Checking Google Cloud auth:', {
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  isRunningLocally: process.env.NODE_ENV === 'development',
  hasADC: process.env.GOOGLE_APPLICATION_DEFAULT_CREDENTIALS
});

export const compile: HttpFunction = async (req: Request, res: Response) => {
  console.log('Compile endpoint called with request body:', {
    hasFiles: !!req.body.files,
    filesCount: req.body.files?.length,
    firstFile: req.body.files?.[0]?.path
  });

  const { files } = req.body;

  if (!files || !Array.isArray(files)) {
    console.warn('Invalid input received:', { files });
    res.status(400).json({ success: false, error: 'Invalid input' });
    return;
  }

  try {
    // Create temporary directory for source files
    const tempDir = path.join(os.tmpdir(), `build-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    console.log('Created temp directory:', tempDir);

    // Write files to temp directory
    for (const file of files) {
      const filePath = path.join(tempDir, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
      console.log(`Written file: ${file.path} to ${filePath}`);
    }

    // Create tarball
    const tarballPath = path.join(os.tmpdir(), `${Date.now()}.tar.gz`);
    await tar.create(
      {
        gzip: true,
        file: tarballPath,
        cwd: tempDir
      },
      ['.']
    );

    console.log('Created tarball:', {
      path: tarballPath,
      size: (await fs.stat(tarballPath)).size
    });

    // Upload tarball to Cloud Storage
    const bucket = storage.bucket(BUCKET_NAME);
    const destFileName = `sources/${path.basename(tarballPath)}`;
    await bucket.upload(tarballPath, {
      destination: destFileName
    });

    console.log('Uploaded tarball to Cloud Storage:', {
      bucket: BUCKET_NAME,
      object: destFileName
    });

    // Create build config with detailed logging
    const buildConfig = {
      projectId: process.env.PROJECT_ID,
      build: {
        source: {
          storageSource: {
            bucket: BUCKET_NAME,
            object: destFileName
          }
        },
        steps: [
          {
            name: `gcr.io/${process.env.PROJECT_ID}/arch-compiler`,
            args: ['cargo', 'build-sbf'],
            env: [
              'CARGO_TARGET_DIR=/workspace/target',
              'RUST_LOG=debug'
            ]
          },
          {
            name: 'gcr.io/cloud-builders/gsutil',
            args: ['cp', '/workspace/target/bpf-solana-solana/release/*.so', `gs://${BUCKET_NAME}/binaries/`]
          }
        ],
        timeout: { seconds: '1800' }
      }
    };

    console.log('Creating build with config:', JSON.stringify(buildConfig, null, 2));

    console.log('Initializing build with credentials:', {
      projectId: process.env.PROJECT_ID,
      hasCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    const buildRequest = {
      projectId: process.env.PROJECT_ID,
      build: {
        source: {
          storageSource: {
            bucket: BUCKET_NAME,
            object: destFileName
          }
        },
        steps: [
          {
            name: `gcr.io/${process.env.PROJECT_ID}/arch-compiler`,
            args: ['cargo', 'build-bpf'],
            env: [
              'CARGO_TARGET_DIR=/workspace/target',
              'RUST_LOG=debug'
            ]
          },
          {
            name: 'gcr.io/cloud-builders/gsutil',
            args: ['cp', '/workspace/target/bpf-solana-solana/release/*.so', `gs://${BUCKET_NAME}/binaries/`]
          }
        ],
        timeout: { seconds: '1800' }
      }
    };

    console.log('Creating build with request:', JSON.stringify(buildRequest, null, 2));

    const [operation] = await cloudbuild.createBuild(buildRequest).catch(error => {
      console.error('Cloud Build API Error:', error);
      throw error;
    });

    console.log('Operation:', operation);

    let buildId;
    try {
      buildId = await getBuildId(operation);
    } catch (error) {
      console.error('Failed to get build ID:', error);
      throw new Error('Build creation failed - could not retrieve build ID');
    }

    console.log('Build created successfully:', {
      buildId,
      operationName: operation.name,
      done: operation.done,
      projectId: process.env.PROJECT_ID
    });

    res.json({
      success: true,
      buildId,
      logUrl: `https://console.cloud.google.com/cloud-build/builds;region=global/${buildId}?project=${process.env.PROJECT_ID}`
    });

  } catch (error) {
    console.error('Build creation failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      projectId: process.env.PROJECT_ID,
      envVars: {
        hasProjectId: !!process.env.PROJECT_ID,
        hasBucketName: !!BUCKET_NAME
      }
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
};

export const getBuildStatus: HttpFunction = async (req: Request, res: Response) => {
  console.log('getBuildStatus called for buildId:', req.params.buildId);

  const buildId = req.params.buildId;

  try {
    const [build] = await cloudbuild.getBuild({
      projectId: process.env.PROJECT_ID,
      id: buildId
    });

    console.log('Build:', build);

    console.log('Build status retrieved:', {
      buildId,
      status: build.status,
      hasLogs: !!build.logsBucket,
      hasFailureInfo: !!build.failureInfo
    });

    const logs = build.logsBucket ? await getBuildLogs(build.logsBucket) : '';

    // If build is complete, get the compiled program
    let program = '';
    if (build.status === 'SUCCESS') {
      console.log('Build successful, fetching program binary');
      const bucket = storage.bucket(BUCKET_NAME);
      const [files] = await bucket.getFiles({ prefix: `binaries/${buildId}` });

      console.log('Found program files:', {
        count: files.length,
        names: files.map(f => f.name)
      });

      if (files.length > 0) {
        const [programData] = await files[0].download();
        program = programData.toString('base64');
        console.log('Program binary downloaded and encoded:', {
          size: programData.length,
          encodedSize: program.length
        });
      }
    }

    res.json({
      success: true,
      status: build.status,
      error: build.failureInfo?.detail || '',
      program,
      logs: logs.toString()
    });

  } catch (error) {
    console.error('Error fetching build status:', {
      buildId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch build status',
      logs: ''
    });
  }
};

async function getBuildLogs(logsBucket: string): Promise<string> {
  const bucket = storage.bucket(logsBucket.replace('gs://', ''));
  const [files] = await bucket.getFiles();
  if (files.length === 0) return '';
  const [content] = await files[0].download();
  return content.toString();
}

async function getBuildId(operation: any): Promise<string> {
  const MAX_RETRIES = 10;
  const RETRY_DELAY = 1000; // 1 second

  for (let i = 0; i < MAX_RETRIES; i++) {
    if (operation.metadata?.build?.id) {
      return operation.metadata.build.id;
    }

    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

    // Refresh operation status if possible
    if (operation.name) {
      try {
        const [updatedOperation] = await cloudbuild.getBuild({
          projectId: process.env.PROJECT_ID,
          id: operation.metadata?.build?.id
        });
        operation = updatedOperation;
      } catch (error) {
        console.warn('Failed to refresh operation status:', error);
      }
    }
  }

  throw new Error('Build ID not available after maximum retries');
}

const router = Router();
router.post('/', compile);
router.get('/status/:buildId', getBuildStatus);

export const compileRoute = router;