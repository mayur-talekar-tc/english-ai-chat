const users = []; // In-memory store (replace with DB later)

const register = (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, error: 'All fields are required' });
  }

  const exists = users.find(u => u.email === email);
  if (exists) {
    return res.json({ success: false, error: 'Email already registered' });
  }

  const user = { name, email, password };
  users.push(user);

  res.json({ success: true, user: { name, email } });
};

const login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, error: 'All fields are required' });
  }

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.json({ success: false, error: 'Invalid email or password' });
  }

  res.json({ success: true, user: { name: user.name, email: user.email } });
};

module.exports = { register, login };
