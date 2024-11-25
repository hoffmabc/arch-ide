// backend/src/models/Project.ts
import mongoose from 'mongoose';

const FileNodeSchema = new mongoose.Schema({
  name: String,
  type: {
    type: String,
    enum: ['file', 'directory']
  },
  content: String,
  children: [{ type: mongoose.Schema.Types.Mixed }] // Recursive reference
});

const ProjectSchema = new mongoose.Schema({
  id: String,
  name: String,
  description: String,
  files: [FileNodeSchema],
  created: Date,
  lastModified: Date,
  userId: String // For multi-user support
});

export const Project = mongoose.model('Project', ProjectSchema);

// backend/src/routes/projects.ts
import express from 'express';
import { Project } from '../models/Project';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const project = new Project(req.body);
    await project.save();
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.user?.id });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { ...req.body, lastModified: new Date() },
      { new: true }
    );
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { router as projectRoutes };