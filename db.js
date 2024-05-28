const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(
      'mongodb+srv://admin:admin@cluster0.yjrlcgj.mongodb.net/Game',
      {
        dbName: 'Game',
        // useNewUrlParser: true,
        // useUnifiedTopology: true,
      },
    );
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error(err.message);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;
