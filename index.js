// const express = require('express');
// const cors = require('cors');
// require('dotenv').config();
// const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const admin = require('firebase-admin');
// const app = express();
// const port = process.env.PORT || 3000;

// // ✅ Middleware
// app.use(cors());
// app.use(express.json());

// // ✅ Firebase Admin Initialization
// const serviceAccount = require('./serviceAccountKey.json');
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
// });

// // ✅ MongoDB Connection
// // const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@yousufw3working.ii3afjm.mongodb.net/?retryWrites=true&w=majority&appName=YousufW3Working`;

// const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@cluster0.mr3w9gn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// const client = new MongoClient(uri, {
//     serverApi: {
//         version: ServerApiVersion.v1,
//         strict: true,
//         deprecationErrors: true,
//     },
// });

// // ✅ JWT Middleware
// const verifyJWT = async (req, res, next) => {
//     const authHeader = req.headers.authorization;
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//         return res.status(401).send({ message: 'Unauthorized: No token' });
//     }

//     const token = authHeader.split(' ')[1];

//     try {
//         const decodedUser = await admin.auth().verifyIdToken(token);
//         req.user = decodedUser;
//         next();
//     } catch (error) {
//         console.error("JWT verification error:", error);
//         return res.status(403).send({ message: 'Forbidden: Invalid token' });
//     }
// };

// // ✅ Token verify route
// app.post('/jwt', async (req, res) => {
//     const { token } = req.body;

//     if (!token) {
//         return res.status(400).send({ message: 'Token missing' });
//     }

//     try {
//         const decoded = await admin.auth().verifyIdToken(token);
//         res.send({ token });
//     } catch (error) {
//         console.error('JWT verification error:', error);
//         res.status(401).send({ message: 'Invalid or expired token' });
//     }
// });

// // ✅ Main logic
// async function run() {
//     try {
//         const db = client.db('coursehub_db');
//         const tasksCollection = db.collection('courses');
//         const usersCollection = db.collection('users');

//         // Add user
//         app.post('/users', async (req, res) => {
//             const user = req.body;
//             const existing = await usersCollection.findOne({ email: user.email });
//             if (existing) {
//                 return res.status(409).send({ message: 'User already exists' });
//             }
//             const result = await usersCollection.insertOne(user);
//             res.send(result);
//         });

//         // All tasks (protected)
//         app.get('/courses', verifyJWT, async (req, res) => {
//             const result = await tasksCollection.find().toArray();
//             res.send(result);
//         });

//         // Top 6 tasks
//         app.get('/courses/top', verifyJWT, async (req, res) => {
//             const result = await tasksCollection.find().limit(6).toArray();
//             res.send(result);
//         });

//         // Get single task
//         app.get('/courses/:id', verifyJWT, async (req, res) => {
//             const id = req.params.id;
//             const result = await tasksCollection.findOne({ _id: new ObjectId(id) });
//             res.send(result);
//         });

//         // Add task
//         app.post('/courses', verifyJWT, async (req, res) => {
//             const newTask = req.body;
//             const result = await tasksCollection.insertOne(newTask);
//             res.send(result);
//         });

//         // Update task
//         app.put('/courses/:id', verifyJWT, async (req, res) => {
//             const id = req.params.id;
//             const updatedTask = req.body;
//             const result = await tasksCollection.updateOne(
//                 { _id: new ObjectId(id) },
//                 {
//                     $set: {
//                         title: updatedTask.title,
//                         category: updatedTask.category,
//                         description: updatedTask.description,
//                         deadline: updatedTask.deadline,
//                         budget: updatedTask.budget,
//                         updatedAt: updatedTask.updatedAt,
//                     },
//                 }
//             );
//             res.send(result);
//         });

//         // Delete task
//         app.delete('/courses/:id', verifyJWT, async (req, res) => {
//             const id = req.params.id;
//             const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
//             res.send(result);
//         });

//         console.log("✅ Connected to MongoDB and ready!");
//     } catch (error) {
//         console.error("❌ Error during server run:", error);
//     }
// }

// // ✅ Start the server
// run().catch(console.dir);

// // ✅ Health check
// app.get('/', (req, res) => {
//     res.send('CourseHub Server is Running with JWT!');
// });

// app.listen(port, () => {
//     console.log(`🚀 Server running at http://localhost:${port}`);
// });







// index.js

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// MongoDB Client
const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@cluster0.mr3w9gn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        await client.connect();
        const db = client.db('coursehub_db');
        const coursesCollection = db.collection('courses');
        const usersCollection = db.collection('users');

        // Routes
        app.get('/', (req, res) => {
            res.send('CourseHub Server is Running!');
        });

        app.get('/courses', async (req, res) => {
            const result = await coursesCollection.find().toArray();
            res.send(result);
        });

        app.get('/courses/top', async (req, res) => {
            const result = await coursesCollection.find().limit(6).toArray();
            res.send(result);
        });

        app.get('/courses/:id', async (req, res) => {
            const id = req.params.id;
            const result = await coursesCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        app.post('/courses', async (req, res) => {
            const newCourse = req.body;
            const result = await coursesCollection.insertOne(newCourse);
            res.send(result);
        });

        app.put('/courses/:id', async (req, res) => {
            const id = req.params.id;
            const updatedCourse = req.body;
            const result = await coursesCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        courseTitle: updatedCourse.courseTitle,
                        imageURL: updatedCourse.imageURL,
                        seats: updatedCourse.seats,
                        duration: updatedCourse.duration,
                        instructorName: updatedCourse.instructorName,
                        instructorEmail: updatedCourse.instructorEmail,
                        enrollmentCount: updatedCourse.enrollmentCount,
                        rating: updatedCourse.rating,
                        shortDescription: updatedCourse.shortDescription,
                        fullDescription: updatedCourse.fullDescription,
                        timestamp: updatedCourse.timestamp,
                    },
                }
            );
            res.send(result);
        });

        app.delete('/courses/:id', async (req, res) => {
            const id = req.params.id;
            const result = await coursesCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const existing = await usersCollection.findOne({ email: user.email });
            if (existing) {
                return res.status(409).send({ message: 'User already exists' });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        console.log("✅ Server connected and ready");
    } catch (err) {
        console.error("❌ Error starting server:", err);
    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
