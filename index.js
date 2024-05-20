const express = require('express');
const connectDB = require('./db');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Decimal128 } = require('mongodb');
const { values } = require('lodash');

const app = express();
const PORT = process.env.PORT || 5000;
const secretKey = 'im-broke-website';

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(cors());

// Define User schema and model
const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  coin: {
    type: Decimal128,
    default: 0,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', UserSchema);
User.createIndexes();

// Routes
app.get('/api', (req, res) => {
  res.send('App is Working');
});

// Assuming you already have these requires and middleware setup

// Login route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find the user with the provided email
    const user = await User.findOne({ email });

    // If user not found, return error
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Compare the provided password with the hashed password stored in the database
    const isPasswordValid = await bcrypt.compare(password, user.password);

    // If passwords don't match, return error
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // If passwords match, generate JWT token
    const token = jwt.sign({ userId: user._id }, secretKey, {
      expiresIn: '1h',
    });

    // Return token to the client
    res.json({ token });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Something went wrong');
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user with hashed password
    const user = new User({
      name,
      email,
      password: hashedPassword,
      coin: 0,
    });

    // Save the user to the database
    const result = await user.save();

    // Omit password from the response
    const responseData = { ...result.toObject() };
    delete responseData.password;

    res.json(responseData);
    console.log(responseData);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Something went wrong');
  }
});

app.get('/api/getuserid', (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), secretKey);
    const userId = decoded.userId;
    res.json({ userId });
  } catch (error) {
    console.error('Error decoding token:', error);
    res.status(401).json({ message: 'Unauthorized' });
  }
});

app.get('/api/getuser', async (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), secretKey);
    const userId = decoded.userId;

    // Find the user in the database by ID
    const userData = await User.findById(userId).select('-password');

    if (!userData) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(userData);
  } catch (error) {
    console.error('Error decoding token:', error);
    res.status(401).json({ message: 'Unauthorized' });
  }
});

// Start the server
app.listen(PORT, () => console.log(`Server started on PORT ${PORT}`));
