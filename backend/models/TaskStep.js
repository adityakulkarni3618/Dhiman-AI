const mongoose = require('mongoose');

const TaskStepSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  stepIndex: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  action: {
    tool: { type: String },
    args: { type: mongoose.Schema.Types.Mixed }
  },
  observation: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED'],
    default: 'PENDING'
  },
  error: {
    type: String,
    default: ''
  },
  verified: {
    type: Boolean,
    default: false
  },
  verificationDetails: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TaskStep', TaskStepSchema);
