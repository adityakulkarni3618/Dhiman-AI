const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  goal: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PLANNING', 'WAITING_FOR_APPROVAL', 'RUNNING', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED'],
    default: 'PENDING'
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM'
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  currentStepIndex: {
    type: Number,
    default: 0
  },
  toolsUsed: {
    type: [String],
    default: []
  },
  result: {
    type: String,
    default: ''
  },
  error: {
    type: String,
    default: ''
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Task', TaskSchema);
