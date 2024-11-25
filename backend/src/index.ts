import express from 'express';
import cors from 'cors';
import { compileRoute } from './routes/compile';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/compile', compileRoute);

app.listen(8080, () => console.log('Server running on port 8080'));