const express = require('express');
const connectDB = require('./db');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Decimal128 } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 5000;
const secretKey = 'im-broke-website';
const url = '/api';

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
    // unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const RoomSchema = new mongoose.Schema({
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  password: {
    type: String,
  },
  rateDefault: {
    type: Decimal128,
    default: 0,
  },
  users: Array,
  date: {
    type: Date,
    default: Date.now,
  },
});

const CoinSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  balance: {
    type: Decimal128,
    default: 0,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const TransferLogSchema = new mongoose.Schema({
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Decimal128,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', UserSchema);
User.createIndexes();

const Room = mongoose.model('Room', RoomSchema);
Room.createIndexes();

const Coin = mongoose.model('Coin', CoinSchema);
Coin.createIndexes();

const TransferLog = mongoose.model('TransferLog', TransferLogSchema);
TransferLog.createIndexes();

// Routes
app.get(`${url}`, (req, res) => {
  res.send('App is Working');
});

// Login route
app.post(`${url}/user/login`, async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id }, secretKey, {
      expiresIn: '1h',
    });
    res.json({ token });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Something went wrong');
  }
});

app.post(`${url}/user/register`, async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    const result = await user.save();

    const coin = new Coin({ user_id: result._id, balance: 0 });
    await coin.save();

    const responseData = { ...result.toObject() };
    delete responseData.password;

    res.json(responseData);
    console.log(responseData);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Something went wrong');
  }
});

app.get(`${url}/user/:id`, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    const coin = await Coin.findOne({ user_id: userId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ ...user.toObject(), coin: coin.balance.toString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get(`${url}/getuser`, async (req, res) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token.replace('Bearer ', ''), secretKey);
    const userId = decoded.userId;

    const userData = await User.findById(userId).select('-password');
    const coinData = await Coin.findOne({ user_id: userId });

    if (!userData) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ ...userData.toObject(), coin: coinData.balance.toString() });
  } catch (error) {
    console.error('Error decoding token:', error);
    res.status(401).json({ message: 'Unauthorized' });
  }
});

app.post(`${url}/createroom`, async (req, res) => {
  const { name, password, owner_id, rateDefault } = req.body;

  try {
    const ownerUser = await User.findById(owner_id);

    if (!ownerUser) {
      return res.status(404).json({ message: 'Owner user not found' });
    }

    const newRoom = new Room({
      owner_id: ownerUser._id,
      name,
      password,
      rateDefault,
    });
    const savedRoom = await newRoom.save();

    res.status(200).json(savedRoom);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.post(`${url}/room/user/join`, async (req, res) => {
  const { roomId, userId } = req.body;

  try {
    const room = await Room.findById(roomId);
    const user = await User.findById(userId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingUser = room.users.find(
      (u) => u._id.toString() === user._id.toString(),
    );
    if (existingUser) {
      return res
        .status(200)
        .json({ status: 200, message: 'User already in the room' });
    }

    if (!room.users) {
      room.users = [user];
    } else {
      room.users.push(user);
    }

    const updatedRoom = await room.save();
    const response = {
      status: 200,
      message: 'User join in the room',
      data: updatedRoom,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.get(`${url}/room`, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 5;
    const skip = (page - 1) * perPage;

    const totalRooms = await Room.countDocuments();
    const rooms = await Room.find().skip(skip).limit(perPage);
    const totalPages = Math.ceil(totalRooms / perPage);

    const responseObject = {
      page,
      per_page: perPage,
      total: totalRooms,
      total_pages: totalPages,
      data: rooms.map((room) => ({
        id: room._id,
        name: room.name,
      })),
    };

    res.status(200).json(responseObject);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.get(`${url}/room/:id`, async (req, res) => {
  try {
    const roomId = req.params.id;
    const room = await Room.findById(roomId).populate('users');

    if (!room) {
      return res.status(404).json({ message: 'Room not found!' });
    }

    if (room.users) {
      for (const user of room.users) {
        const coin = await Coin.findOne({ user_id: user._id });
        user.coin = parseFloat(coin.balance.toString());
      }
    }

    // Transform rateDefault from Decimal128 to number
    const roomData = room.toObject();
    roomData.rateDefault = roomData.rateDefault
      ? parseFloat(roomData.rateDefault.toString())
      : 0;

    res.status(200).json(roomData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post(`${url}/transfer`, async (req, res) => {
  const { senderId, receiverId, amount } = req.body;

  try {
    const transferAmount = Decimal128.fromString(amount.toString());
    const transferAmountNumber = parseFloat(transferAmount.toString());

    if (isNaN(transferAmountNumber) || transferAmountNumber <= 0) {
      return res.status(400).json({ message: 'Invalid transfer amount' });
    }

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);
    const senderCoin = await Coin.findOne({ user_id: senderId });
    const receiverCoin = await Coin.findOne({ user_id: receiverId });

    if (!sender || !receiver || !senderCoin || !receiverCoin) {
      return res.status(404).json({ message: 'Sender or receiver not found' });
    }

    const senderBalanceNumber = parseFloat(senderCoin.balance.toString());

    if (senderBalanceNumber < transferAmountNumber) {
      return res.status(400).json({
        message: `Insufficient balance ( You have balance ${senderBalanceNumber} )`,
      });
    }

    const newSenderBalance = senderBalanceNumber - transferAmountNumber;
    const newReceiverBalance =
      parseFloat(receiverCoin.balance.toString()) + transferAmountNumber;

    senderCoin.balance = Decimal128.fromString(newSenderBalance.toString());
    receiverCoin.balance = Decimal128.fromString(newReceiverBalance.toString());

    await senderCoin.save();
    await receiverCoin.save();

    const transferLog = new TransferLog({
      sender_id: senderId,
      receiver_id: receiverId,
      amount: transferAmount,
    });
    await transferLog.save();

    res.status(200).json({ message: 'Transfer successful' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.get(`${url}/transfer/logs`, async (req, res) => {
  const { userId } = req.query;

  try {
    let logs;
    if (userId) {
      logs = await TransferLog.find({
        $or: [{ sender_id: userId }, { receiver_id: userId }],
      })
        .populate('sender_id', 'name email')
        .populate('receiver_id', 'name email');
    } else {
      logs = await TransferLog.find()
        .populate('sender_id', 'name email')
        .populate('receiver_id', 'name email');
    }

    res.status(200).json(logs);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.listen(PORT, () => console.log(`Server started on PORT ${PORT}`));
