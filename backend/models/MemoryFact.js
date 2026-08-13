const mongoose = require('mongoose');

const MemoryFactSchema = new mongoose.Schema({
  fact: {
    type: String,
    required: true,
    minlength: 5
  },
  embedding: {
    type: [Number], // Storing 1536 float values for semantic search
    required: true
  },
  sourceMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MemoryFact', MemoryFactSchema);
