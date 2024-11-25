import { Router, Request, Response } from 'express';
import { compilerService } from '../services/compiler';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { code } = req.body;
      if (!code) {
        res.status(400).json({
          success: false, 
          error: 'No code provided' 
        });
        return;
      }
  
      const result = await compilerService.compileCode(code);
      res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred'
        });
    }
});
export { router as compileRoute };