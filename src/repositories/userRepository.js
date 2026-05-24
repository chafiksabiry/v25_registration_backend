import User from '../models/User.js';

class UserRepository {
  async findById(id) {
    return User.findById(id);
  }

  async findByEmail(email) {
    return User.findOne({ email });
  }

  async findByLinkedInId(linkedInId) {
    return User.findOne({ linkedInId });
  }

  async create(userData) {
    const user = new User(userData);
    return user.save();
  }

  async update(id, updateData) {
    return User.findByIdAndUpdate(id, updateData, { new: true });
  }
}

export default new UserRepository();