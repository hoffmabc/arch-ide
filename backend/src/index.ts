import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { compileRoute } from './routes/compile';
import { compiler } from './services/compiler';
import { deployRoute } from './routes/deploy';
const app = express();
const PORT = process.env.PORT || 8080;

// Configure CORS with environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Initialize compiler
compiler.init().catch(err => {
  console.error('Failed to initialize compiler:', err);
  process.exit(1);
});

app.use(cors(corsOptions));
app.use(express.json());
app.use('/compile', compileRoute);
app.use('/deploy', deployRoute);
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