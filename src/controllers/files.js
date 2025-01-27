import File from '../models/File.js';
import fs from 'fs/promises';
import path from 'path';
import fileService from '../services/fileService.js';

// Upload file
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const file = await fileService.uploadFile(req.file, req.user.userId, {
      lastModified: req.body.lastModified
    });
    res.status(201).json(file);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get files
export const getFiles = async (req, res) => {
  try {
    const files = await fileService.getFiles(req.user.userId);
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete file
export const deleteFile = async (req, res) => {
  try {
    const result = await fileService.deleteFile(req.params.id, req.user.userId);
    res.json(result);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

// Toggle public access
export const togglePublicAccess = async (req, res) => {
  try {
    const file = await fileService.togglePublicAccess(req.params.id, req.user.userId);
    res.json(file);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

// Export files
export const exportFiles = async (req, res) => {
  try {
    const files = await fileService.exportFiles(req.user.userId);
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};