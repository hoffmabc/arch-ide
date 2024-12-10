import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { compileRoute } from './routes/compile';
import { compiler } from './services/compiler';

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize compiler
compiler.init().catch(err => {
  console.error('Failed to initialize compiler:', err);
  process.exit(1);
});

app.use(cors());
app.use(express.json());
app.use('/compile', compileRoute);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});