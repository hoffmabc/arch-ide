import express from 'express';
import cors from 'cors';
import { compileRoute } from './routes/compile';
import { compiler } from './services/compiler';

const app = express();

compiler.init().catch(console.error);

app.use(cors());
app.use(express.json());
app.use('/compile', compileRoute);

app.listen(8080, () => console.log('Server running on port 8080'));