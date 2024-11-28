import { Router, Request, Response } from 'express';
import { compiler } from '../services/compiler';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {

      const { files } = req.body;
      
      if (!files || !Array.isArray(files)) {
        res.status(400).json({
          success: false, 
          error: 'No files provided or invalid format' 
        });
        return;
      }

      // Validate required files exist
      const hasLibRs = files.some(f => f.path === 'src/lib.rs');
      const hasCargoToml = files.some(f => f.path === 'Cargo.toml');
      
      if (!hasLibRs || !hasCargoToml) {
        res.status(400).json({
          success: false,
          error: 'Missing required files (lib.rs and/or Cargo.toml)'
        });
        return;
      }

      console.log('Received files:', files);
      const result = await compiler.compile(files);
      res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        });
    }
});

export { router as compileRoute };