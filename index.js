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
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  room_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  amount: {
    type: Decimal128,
    required: true,
  },
  type: { type: String, enum: ['debit', 'credit'], required: true },
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

app.post(`${url}/room/user/leave`, async (req, res) => {
  const { roomId, userId } = req.body;
  console.log('roomId', roomId);
  console.log('userId', userId);

  if (!roomId || !userId) {
    return res.status(400).json({ message: 'roomId and userId are required' });
  }

  try {
    const room = await Room.findById(roomId);
    const user = await User.findById(userId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if the user is the owner
    if (room.owner_id.toString() === user._id.toString()) {
      return res.status(400).json({ message: 'Owner cannot leave the room' });
    }

    const userIndex = room.users.findIndex(
      (u) => u._id.toString() === user._id.toString(),
    );

    if (userIndex === -1) {
      return res.status(400).json({ message: 'User not in the room' });
    }

    room.users.splice(userIndex, 1);

    await room.save();

    res.status(200).json({ message: 'User left the room successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.delete(`${url}/room/close`, async (req, res) => {
  const { roomId, ownerId } = req.body;
  console.log('roomId', roomId);

  try {
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.owner_id.toString() !== ownerId) {
      return res
        .status(403)
        .json({ message: 'Only the owner can close the room' });
    }

    await Room.findByIdAndDelete(roomId);

    res.status(200).json({ message: 'Room closed successfully' });
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
  const { senderId, receiverId, amount, roomId } = req.body;

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

    const senderLog = new TransferLog({
      sender_id: senderId,
      receiver_id: receiverId,
      owner_id: senderId,
      amount: transferAmount,
      type: 'debit',
      room_id: roomId,
    });
    const receiverLog = new TransferLog({
      sender_id: senderId,
      receiver_id: receiverId,
      owner_id: receiverId,
      amount: transferAmount,
      type: 'credit',
      room_id: roomId,
    });

    await Promise.all([senderLog.save(), receiverLog.save()]);

    res.status(200).json({ message: 'Transfer successful' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.get(`${url}/transfer/logs/user/:userId`, async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.per_page) || 5;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  try {
    const logs = await TransferLog.find({
      $or: [{ sender_id: userId }, { receiver_id: userId }],
      owner_id: userId, // กรองด้วย owner_id เพื่อแสดงเฉพาะ log ที่เป็นเจ้าของของผู้ใช้
    })
      .populate('sender_id', 'name email')
      .populate('receiver_id', 'name email')
      .sort({ date: -1 }) // เรียงลำดับตามวันที่จากล่างขึ้นบน
      .skip((page - 1) * perPage)
      .limit(perPage);

    const totalLogs = await TransferLog.countDocuments({
      $or: [{ sender_id: userId }, { receiver_id: userId }],
      owner_id: userId, // กรองด้วย owner_id เพื่อนับจำนวน log เฉพาะที่เป็นเจ้าของของผู้ใช้
    });

    const unreadLogsCount = await TransferLog.countDocuments({
      $or: [{ sender_id: userId }, { receiver_id: userId }],
      owner_id: userId, // กรองด้วย owner_id เพื่อนับจำนวน log ที่ยังไม่ได้อ่านเฉพาะที่เป็นเจ้าของของผู้ใช้
      isRead: false,
    });

    if (!logs.length) {
      return res
        .status(404)
        .json({ message: 'No transfer logs found for this user' });
    }

    // Convert amount from Decimal128 to number
    const logsWithConvertedAmount = logs.map((log) => ({
      ...log.toObject(),
      amount: parseFloat(log.amount.toString()),
    }));

    const response = {
      page,
      per_page: perPage,
      total: totalLogs,
      total_pages: Math.ceil(totalLogs / perPage),
      unread_count: unreadLogsCount,
      data: logsWithConvertedAmount,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.patch(`${url}/transfer/logs/:logId/read`, async (req, res) => {
  const { logId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(logId)) {
    return res.status(400).json({ message: 'Invalid log ID' });
  }

  try {
    // Find the transfer log by ID and update its isRead property to true
    const transferLog = await TransferLog.findByIdAndUpdate(
      logId,
      { isRead: true },
      { new: true },
    );

    if (!transferLog) {
      return res.status(404).json({ message: 'Transfer log not found' });
    }

    // Return the updated transfer log
    res.status(200).json(transferLog);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.patch(`${url}/transfer/logs/user/:userId/read-all`, async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  try {
    // Update all transfer logs associated with the user to set isRead to true
    const result = await TransferLog.updateMany(
      {
        $or: [{ sender_id: userId }, { receiver_id: userId }],
        isRead: false,
      },
      { isRead: true },
    );

    if (result.nModified === 0) {
      return res
        .status(404)
        .json({ message: 'No unread transfer logs found for this user' });
    }

    res
      .status(200)
      .json({ message: `${result.nModified} transfer logs marked as read` });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.get(`${url}/room/:roomId/summary`, async (req, res) => {
  const { roomId } = req.params;

  try {
    // ค้นหาห้องโดยใช้ roomId
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // ค้นหา log โดยใช้ roomId
    const logs = await TransferLog.find({ room_id: roomId })
      .populate('sender_id', 'name')
      .populate('receiver_id', 'name')
      .sort({ date: -1 }); // เรียงลำดับตามวันที่ล่าสุด

    // สร้างโครงสร้างข้อมูลสำหรับการสรุปผล
    const summary = {
      room: room.name,
      transactions: [],
    };

    // รวมรายการการโอนเงินตามคู่ของผู้ส่งและผู้รับ
    logs.forEach((log) => {
      const senderName = log.sender_id.name;
      const receiverName = log.receiver_id.name;
      const amount = parseFloat(log.amount.toString());

      // ตรวจสอบว่ามีการโอนเงินระหว่างคู่ผู้ส่งและผู้รับนี้แล้วหรือไม่
      const existingTransaction = summary.transactions.find((transaction) => {
        return (
          transaction.sender === senderName &&
          transaction.receiver === receiverName
        );
      });

      if (existingTransaction) {
        // ถ้ามีให้เพิ่มจำนวนเงินที่โอนเข้าไปในรายการโอนเงินเดิม
        existingTransaction.amount += amount;
      } else {
        // ถ้ายังไม่มีให้สร้างรายการโอนเงินใหม่
        summary.transactions.push({
          sender: senderName,
          receiver: receiverName,
          amount: amount,
        });
      }
    });

    res.status(200).json(summary);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.post(`${url}/room/summary`, async (req, res) => {
  const { userId, roomId } = req.body;

  try {
    // ตรวจสอบว่ามีค่า userId และ roomId ที่ส่งมาหรือไม่
    if (!userId || !roomId) {
      return res
        .status(400)
        .json({ message: 'User ID and Room ID are required' });
    }

    // ค้นหาห้องโดยใช้ roomId
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // ค้นหา log โดยใช้ userId และ roomId
    const logs = await TransferLog.find({
      $or: [{ sender_id: userId }, { receiver_id: userId }],
      room_id: roomId,
      owner_id: userId,
      sender_id: userId,
      type: 'debit',
    })
      .populate('sender_id', 'name')
      .populate('receiver_id', 'name')
      .populate('owner_id', 'name') // เพิ่มการ populate owner_id
      .sort({ date: -1 }); // เรียงลำดับตามวันที่ล่าสุด

    // สร้างโครงสร้างข้อมูลสำหรับการสรุปผล
    const summary = {
      room: room.name,
      transactions: [],
    };

    // รวมรายการการโอนเงินตามคู่ของผู้ส่งและผู้รับ
    logs.forEach((log) => {
      const senderName = log.sender_id.name;
      const receiverName = log.receiver_id.name;
      const ownerName = log.owner_id.name; // เพิ่ม ownerName

      // ตรวจสอบว่ามีการโอนเงินระหว่างคู่ผู้ส่งและผู้รับนี้แล้วหรือไม่
      const existingTransaction = summary.transactions.find((transaction) => {
        return (
          transaction.sender === senderName &&
          transaction.receiver === receiverName &&
          transaction.owner === ownerName // เพิ่มเงื่อนไขการเปรียบเทียบ ownerName
        );
      });

      if (existingTransaction) {
        // ถ้ามีให้เพิ่มจำนวนเงินที่โอนเข้าไปในรายการโอนเงินเดิม
        existingTransaction.amount += parseFloat(log.amount.toString());
      } else {
        // ถ้ายังไม่มีให้สร้างรายการโอนเงินใหม่
        summary.transactions.push({
          sender: senderName,
          receiver: receiverName,
          owner: ownerName, // เพิ่ม ownerName
          amount: parseFloat(log.amount.toString()),
        });
      }
    });

    res.status(200).json(summary);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.get(`${url}/ranking`, async (req, res) => {
  try {
    // Aggregate the coin balances for each user
    const ranking = await Coin.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: '$user',
      },
      {
        $project: {
          userId: '$user._id',
          name: '$user.name',
          email: '$user.email',
          totalBalance: { $toDouble: '$balance' },
        },
      },
      {
        $sort: { totalBalance: -1 },
      },
    ]);

    // Calculate ranks considering ties
    let rank = 0;
    let previousBalance = null;

    const rankingWithPosition = ranking.map((item, index) => {
      if (previousBalance == null || previousBalance != item.totalBalance) {
        previousBalance = item.totalBalance;
        rank++;
      }

      return {
        ...item,
        no: rank,
      };
    });

    // Return the results
    res.status(200).json({ ranking: rankingWithPosition });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

app.listen(PORT, () => console.log(`Server started on PORT ${PORT}`));
