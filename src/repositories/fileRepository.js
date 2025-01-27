import File from '../models/File.js';

export class FileRepository {
  async create(fileData) {
    const file = new File(fileData);
    return file.save();
  }

  async findByUser(userId, options = {}) {
    return File.find({ uploadedBy: userId })
      .sort({ createdAt: -1 })
      .skip(options.skip)
      .limit(options.limit);
  }

  async findOne(query) {
    return File.findOne(query);
  }

  async delete(id) {
    return File.findByIdAndDelete(id);
  }

  async update(id, updateData) {
    return File.findByIdAndUpdate(id, updateData, { new: true });
  }
}

export default new FileRepository();