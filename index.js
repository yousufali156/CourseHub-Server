// // index.js

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


// const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@cluster0.mr3w9gn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;




// const client = new MongoClient(uri, {
//     serverApi: {
//         version: ServerApiVersion.v1,
//         strict: true,
//         deprecationErrors: true,
//     },
// });

// async function run() {
//     try {
//         await client.connect();
//         const db = client.db('coursehub_db');
//         const coursesCollection = db.collection('courses');
//         const enrollsCollection = db.collection('enrolls');
//         const usersCollection = db.collection('users');

//         // 🔹 Health Check Route
//         app.get('/', (req, res) => {
//             res.send('✅ CourseHub Server is Running!');
//         });

//         // 🔹 Get All Courses
//         app.get('/courses', async (req, res) => {
//             const result = await coursesCollection.find().toArray();
//             res.send(result);
//         });

//         // 🔹 Get Top 6 Courses
//         app.get('/courses/top', async (req, res) => {
//             const result = await coursesCollection.find().limit(6).toArray();
//             res.send(result);
//         });

//         // 🔹 Get Single Course
//         app.get('/courses/:id', async (req, res) => {
//             const id = req.params.id;
//             const result = await coursesCollection.findOne({ _id: new ObjectId(id) });
//             res.send(result);
//         });

//         // 🔹 Add New Course
//         app.post('/courses', async (req, res) => {
//             const newCourse = req.body;
//             const result = await coursesCollection.insertOne(newCourse);
//             res.send(result);
//         });

//         // 🔹 Add New Course
//         app.post('/enrolls', async (req, res) => {
//             const newCourse = req.body;
//             const result = await enrollsCollection.insertOne(newCourse);
//             res.send(result);
//         });

//         app.post('/api/courses', async (req, res) => {
//             const course = req.body;
//             if (!course.firebaseId) {
//                 return res.status(400).json({ error: 'firebaseId missing' });
//             }
//             try {
//                 const result = await coursesCollection.insertOne(course);
//                 res.status(201).json({ message: 'Course saved in MongoDB', result });
//             } catch (err) {
//                 res.status(500).json({ error: 'Failed to save course' });
//             }
//         });

//         // 🔹 Update Course
//         app.put('/courses/:id', async (req, res) => {
//             const id = req.params.id;
//             const updatedCourse = req.body;
//             const result = await coursesCollection.updateOne(
//                 { _id: new ObjectId(id) },
//                 {
//                     $set: {
//                         courseTitle: updatedCourse.courseTitle,
//                         imageURL: updatedCourse.imageURL,
//                         seats: updatedCourse.seats,
//                         duration: updatedCourse.duration,
//                         instructorName: updatedCourse.instructorName,
//                         instructorEmail: updatedCourse.instructorEmail,
//                         enrollmentCount: updatedCourse.enrollmentCount,
//                         rating: updatedCourse.rating,
//                         shortDescription: updatedCourse.shortDescription,
//                         fullDescription: updatedCourse.fullDescription,
//                         timestamp: updatedCourse.timestamp,
//                     },
//                 }
//             );
//             res.send(result);
//         });

//         // 🔹 Delete Course
//         app.delete('/courses/:id', async (req, res) => {
//             const id = req.params.id;
//             const result = await coursesCollection.deleteOne({ _id: new ObjectId(id) });
//             res.send(result);
//         });

//         // DELETE from MongoDB mmmmmmmmmmmmmmmmmmmmmmmm
//         app.delete('/api/courses/:id', async (req, res) => {
//             try {
//                 const { id } = req.params;
//                 const result = await coursesCollection.deleteOne({ firebaseId: id });
//                 res.status(200).json({ message: 'Deleted from MongoDB', result });
//             } catch (err) {
//                 res.status(500).json({ error: 'Failed to delete from MongoDB' });
//             }
//         });

//         // 🔹 Add User
//         app.post('/users', async (req, res) => {
//             const user = req.body;
//             const existing = await usersCollection.findOne({ email: user.email });
//             if (existing) {
//                 return res.status(409).send({ message: 'User already exists' });
//             }
//             const result = await usersCollection.insertOne(user);
//             res.send(result);
//         });

//         console.log("✅ MongoDB connected. Server ready.");
//     } catch (err) {
//         console.error("❌ Server error:", err);
//     }
// }

// run().catch(console.dir);

// // ✅ Start Server
// app.listen(port, () => {
//     console.log(`🚀 Server running at http://localhost:${port}`);
// });



const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ Firebase Admin Initialization
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// const { ObjectId } = require('mongodb');

// ✅ MongoDB Connection
const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@cluster0.mr3w9gn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

let db;
let coursesCollection;
let usersCollection;
let enrollmentsCollection;

async function run() {
    try {
        await client.connect();
        db = client.db('coursehub_db');
        coursesCollection = db.collection('courses');
        usersCollection = db.collection('users');
        enrollmentsCollection = db.collection('enrollments');

        console.log("✅ MongoDB connected. Server ready.");

        // 🔹 Health Check
        app.get('/', (req, res) => {
            res.send('✅ CourseHub Server is Running!');
        });

        // 🔹 Get All Courses
        app.get('/courses', async (req, res) => {
            const result = await coursesCollection.find().toArray();
            res.send(result);
        });

        // ✅ Add New Course (Matches AddCourse Component)
        app.post('/courses', async (req, res) => {
            try {
                const {
                    courseTitle,
                    image,
                    seats,
                    duration,
                    description,
                    instructorEmail,
                    timestamp
                } = req.body;

                if (!courseTitle || !image || !seats || !duration || !description || !instructorEmail) {
                    return res.status(400).json({ error: 'Missing required course fields.' });
                }

                const newCourse = {
                    courseTitle,
                    image,
                    seats: parseInt(seats, 10),
                    duration,
                    description,
                    instructorEmail,
                    enrollmentCount: 0,
                    status: 'pending',
                    createdAt: timestamp || new Date().toISOString(),
                };

                const result = await coursesCollection.insertOne(newCourse);
                res.status(201).json({
                    message: 'Course added successfully',
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error('❌ Error adding course:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });


        app.delete('/courses/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const result = await coursesCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: 'Course not found' });
                }
                res.send({ message: 'Course deleted successfully' });
            } catch (error) {
                console.error('❌ Error deleting course:', error);
                res.status(500).json({ error: 'Failed to delete course' });
            }
        });

        // Get course by ID
        app.get('/course/:id', async (req, res) => {
            try {
                const course = await db.collection('courses').findOne({ _id: new ObjectId(req.params.id) });
                if (!course) return res.status(404).send({ error: 'Course not found' });
                res.send(course);
            } catch (error) {
                res.status(500).send({ error: 'Failed to fetch course' });
            }
        });

        // Update course by ID
        app.put('/course/:id', async (req, res) => {
            try {
                const updatedData = req.body;
                const result = await db.collection('courses').updateOne(
                    { _id: new ObjectId(req.params.id) },
                    { $set: { ...updatedData, updatedAt: new Date() } }
                );
                if (result.modifiedCount === 0) return res.status(404).send({ error: 'Course not updated' });
                res.send({ message: 'Course updated' });
            } catch (error) {
                res.status(500).send({ error: 'Update failed' });
            }
        });

        


       

    } catch (err) {
        console.error("❌ Server error:", err);
    }
}

run().catch(console.dir);

// ✅ Start Server
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
