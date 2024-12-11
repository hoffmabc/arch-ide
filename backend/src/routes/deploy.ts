import express from 'express';
import { Request } from 'express';
import multer from 'multer';
import { ArchProgramLoader } from '../utils/arch-program-loader';

const router = express.Router();
const upload = multer();

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

router.post('/', upload.single('binary'), async (req: MulterRequest, res) => {
  try {
    const { network, rpcUrl } = req.body;
    const keypair = JSON.parse(req.body.keypair);
    const binary = req.file?.buffer;

    if (!binary) {
      throw new Error('No binary file provided');
    }

    const result = await ArchProgramLoader.load({
      rpcUrl,
      network,
      programBinary: binary,
      keypair
    });

    res.json({
      success: true,
      programId: result.programId,
      txids: result.txids
    });
  } catch (error: any) {
    console.error('Deploy error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export const deployRoute = router;
