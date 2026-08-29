const mongoose = require('mongoose');

const ApprovalSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  stepIndex: {
    type: Number
  },
  actionType: {
    type: String,
    required: true
  },
  commandOrAction: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  reason: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Approval', ApprovalSchema);
