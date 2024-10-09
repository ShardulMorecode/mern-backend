const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');  // CORS middleware
const Transaction = require('./models/Transaction');

const app = express(); // Initialize app first
const port = 5007;

// Enable CORS middleware
app.use(cors());

// Use express.json() to parse incoming JSON requests
app.use(express.json());

// Connect to MongoDB
mongoose.connect("mongodb+srv://moreshardul:e8dMLDVzUG0sJZxW@cluster01.czhwe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster01")
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((err) => {
        console.error("Error connecting to MongoDB", err);
    });

// Fetch and Seed Data from the Third-Party API:
app.get('/api/seed', async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        const transactions = response.data;

        // Save transactions to database
        await Transaction.insertMany(transactions);
        res.send("Database seeded successfully!");
    } catch (error) {
        console.error('Error fetching or saving data', error);
        res.status(500).send('Error fetching or saving data');
    }
});

// 1. Get all transactions with search and pagination
app.get('/api/transactions', async (req, res) => {
    const { page = 1, perPage = 10, search = '', month } = req.query;

    // Create query to match based on month
    const query = month ? { 
        $expr: { $eq: [{ $month: "$dateOfSale" }, new Date(`${month} 1, 2024`).getMonth() + 1] }
    } : {};

    // Modify search to exclude regex on price
    if (search) {
        const searchNumber = parseFloat(search); // Try converting the search term to a number
        if (!isNaN(searchNumber)) {
            query.price = searchNumber; // If it's a number, use it to match price
        } else {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }
    }

    try {
        const transactions = await Transaction.find(query)
            .skip((page - 1) * perPage)
            .limit(Number(perPage));
        const total = await Transaction.countDocuments(query);

        res.json({
            total,
            page: Number(page),
            perPage: Number(perPage),
            transactions,
        });
    } catch (error) {
        console.error('Error fetching transactions', error);
        res.status(500).send('Error fetching transactions');
    }
});

// 2. Getting transaction statistics for selected month
app.get('/api/statistics', async (req, res) => {
    const { month } = req.query;

    try {
        const statistics = await Transaction.aggregate([
            {
                $match: {
                    $expr: { $eq: [{ $month: "$dateOfSale" }, new Date(`${month} 1, 2024`).getMonth() + 1] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$price' },
                    totalSold: { $sum: 1 },
                    totalNotSold: { $sum: { $cond: [{ $gt: ['$price', 0] }, 0, 1] } }
                }
            }
        ]);

        res.json(statistics[0] || { totalAmount: 0, totalSold: 0, totalNotSold: 0 });
    } catch (error) {
        console.error('Error fetching statistics', error);
        res.status(500).send('Error fetching statistics');
    }
});

// 3. Getting data for a bar chart
app.get('/api/bar-chart', async (req, res) => {
    const { month } = req.query;

    try {
        const ranges = [
            { min: 0, max: 100 },
            { min: 101, max: 200 },
            { min: 201, max: 300 },
            { min: 301, max: 400 },
            { min: 401, max: 500 },
            { min: 501, max: 600 },
            { min: 601, max: 700 },
            { min: 701, max: 800 },
            { min: 801, max: 900 },
            { min: 901, max: Infinity }
        ];

        const results = await Promise.all(
            ranges.map(async range => {
                const count = await Transaction.countDocuments({
                    price: { $gte: range.min, $lte: range.max },
                    $expr: { $eq: [{ $month: "$dateOfSale" }, new Date(`${month} 1, 2024`).getMonth() + 1] }
                });
                return { range: `${range.min} - ${range.max}`, count };
            })
        );

        res.json(results);
    } catch (error) {
        console.error('Error fetching bar chart data:', error.message);  // Log the detailed error
        res.status(500).send('Error fetching bar chart data');
    }
});


// 4. Getting data for pie chart
app.get('/api/pie-chart', async (req, res) => {
    const { month } = req.query;

    try {
        const results = await Transaction.aggregate([
            {
                $match: {
                    $expr: { $eq: [{ $month: "$dateOfSale" }, new Date(`${month} 1, 2024`).getMonth() + 1] }
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json(results);
    } catch (error) {
        console.error('Error fetching pie chart data', error);
        res.status(500).send('Error fetching pie chart data');
    }
});

// 5. Combined API to fetch all statistics and charts
app.get('/api/combined', async (req, res) => {
    const { month } = req.query;

    try {
        const [statistics, barChartData, pieChartData] = await Promise.all([
            // Statistics API
            Transaction.aggregate([
                {
                    $match: {
                        $expr: { $eq: [{ $month: "$dateOfSale" }, new Date(`${month} 1, 2024`).getMonth() + 1] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: '$price' },
                        totalSold: { $sum: 1 },
                        totalNotSold: { $sum: { $cond: [{ $gt: ['$price', 0] }, 0, 1] } }
                    }
                }
            ]),
            // Bar Chart API
            Transaction.aggregate([
                {
                    $match: {
                        $expr: { $eq: [{ $month: "$dateOfSale" }, new Date(`${month} 1, 2024`).getMonth() + 1] }
                    }
                },
                {
                    $group: {
                        _id: {
                            $switch: {
                                branches: [
                                    { case: { $lt: ['$price', 100] }, then: '0 - 100' },
                                    { case: { $lt: ['$price', 200] }, then: '101 - 200' },
                                    { case: { $lt: ['$price', 300] }, then: '201 - 300' },
                                    { case: { $lt: ['$price', 400] }, then: '301 - 400' },
                                    { case: { $lt: ['$price', 500] }, then: '401 - 500' },
                                    { case: { $lt: ['$price', 600] }, then: '501 - 600' },
                                    { case: { $lt: ['$price', 700] }, then: '601 - 700' },
                                    { case: { $lt: ['$price', 800] }, then: '701 - 800' },
                                    { case: { $lt: ['$price', 900] }, then: '801 - 900' }
                                ],
                                default: '901-above'
                            }
                        },
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Pie Chart API
            Transaction.aggregate([
                {
                    $match: {
                        $expr: { $eq: [{ $month: "$dateOfSale" }, new Date(`${month} 1, 2024`).getMonth() + 1] }
                    }
                },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        res.json({
            statistics: statistics[0] || { totalAmount: 0, totalSold: 0, totalNotSold: 0 },
            barChartData,
            pieChartData
        });
    } catch (error) {
        console.error('Error fetching combined data', error);
        res.status(500).send('Error fetching combined data');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
