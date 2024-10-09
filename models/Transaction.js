const mongoose = require('mongoose');

const transactionSchema= new mongoose.Schema({
    title: {type: String, required: true},
    description: {type: String, required:true},
    price: { type: Number, required: true},
    dateOfSale: { type: Date, required: true},
    category: { type: String, required: true},
});

const Transaction= mongoose.model('Transaction',transactionSchema);

module.exports = Transaction;
