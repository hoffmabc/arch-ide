// backend/src/models/Project.ts
import mongoose, { Document, Schema } from 'mongoose';
import { Request, Response } from 'express';

// Extend Request type to include user
interface AuthRequest extends Request {
  user?: {
    id: string;
  };
}

export interface IProject extends Document {
  name: string;
  description?: string;
  files: any[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>({
  name: { type: String, required: true },
  description: { type: String },
  files: [{ type: Schema.Types.Mixed }],
  userId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const Project = mongoose.model<IProject>('Project', ProjectSchema);

// Project controller functions
export const getProjects = async (req: AuthRequest, res: Response) => {
  try {
    const projects = await Project.find({ userId: req.user?.id });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
  }
};

export const createProject = async (req: AuthRequest, res: Response) => {
  try {
    const project = new Project({
      ...req.body,
      userId: req.user?.id
    });
    await project.save();
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
  }
};

export const updateProject = async (req: Request, res: Response) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
  }
};