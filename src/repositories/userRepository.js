import User from '../models/User.js';

function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

class UserRepository {
  async findById(id) {
    return User.findById(id);
  }

  async findByEmail(email) {
    return User.findOne({ email });
  }

  /**
   * Match by exact phone or by digit-normalized form so
   * "+33 6 23 98 47 08" and "+33623984708" collide correctly.
   */
  async findByPhone(phone) {
    const trimmed = String(phone || '').trim();
    if (!trimmed) return null;

    const exact = await User.findOne({ phone: trimmed });
    if (exact) return exact;

    const digits = phoneDigits(trimmed);
    if (digits.length < 8) return null;

    const variants = [`+${digits}`, digits];
    const byVariant = await User.findOne({ phone: { $in: variants } });
    if (byVariant) return byVariant;

    // Fallback: same digit sequence ignoring formatting characters
    const escaped = digits.replace(/(\d)/g, '$1\\D*');
    return User.findOne({
      phone: { $regex: new RegExp(`^\\+?${escaped}$`) },
    });
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