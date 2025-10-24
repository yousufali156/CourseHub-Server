//root/index.js

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('./firebaseAdmin');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// Use cors for manage Local host and live host
app.use(cors({
    origin: [process.env.CLIENT_URL, 'http://localhost:5173'],
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());

// Firebase Admin Initialization
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// JWT Verify Middleware
const verifyJWT = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).send({ error: true, message: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).send({ error: true, message: 'Forbidden access' });
        req.decoded = decoded;
        next();
    });
};

// Issue JWT Cookie after Firebase verification
app.post('/jwt', async (req, res) => {
    const { token: firebaseToken } = req.body;
    if (!firebaseToken) return res.status(400).send({ error: true, message: "Missing Firebase ID token" });

    try {
        const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
        const user = { email: decodedToken.email, uid: decodedToken.uid };
        const customJwt = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', customJwt, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.send({ success: true });
    } catch (err) {
        console.error("❌ Firebase token verify failed:", err);
        res.status(401).send({ error: true, message: "Invalid Firebase token" });
    }
});

// Logout
app.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    });
    res.send({ success: true });
});

// MongoDB Setup
const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@cluster0.mr3w9gn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

let db, coursesCollection, usersCollection, enrollmentsCollection;

async function run() {
    try {
        // await client.connect();
        db = client.db('coursehub_db');
        coursesCollection = db.collection('courses');
        usersCollection = db.collection('users');
        enrollmentsCollection = db.collection('enrollments');

        console.log("✅ MongoDB connected. Server ready.");

        app.get('/', (req, res) => {
            res.send('✅ CourseHub Server is Running!');
        });

        // --- Course Routes ---
        app.get('/courses', async (req, res) => {
            const result = await coursesCollection.find().toArray();
            res.send(result);
        });

        app.get('/courses/:id', async (req, res) => {
            try {
                const course = await coursesCollection.findOne({ _id: new ObjectId(req.params.id) });
                if (!course) return res.status(404).json({ error: 'Course not found' });
                res.json(course);
            } catch {
                res.status(500).json({ error: 'Failed to fetch course' });
            }
        });

        app.post('/courses', async (req, res) => {
            try {
                const { courseTitle, image, seats, duration, description, instructorEmail, timestamp } = req.body;
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
                res.status(201).json({ message: 'Course added successfully', insertedId: result.insertedId });
            } catch (err) {
                console.error('❌ Error adding course:', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        //  put method add
        app.put('/course/:id', async (req, res) => {
            try {
                const updatedData = req.body;
                const result = await coursesCollection.updateOne(
                    { _id: new ObjectId(req.params.id) },
                    { $set: { ...updatedData, updatedAt: new Date() } }
                );
                if (result.modifiedCount === 0) return res.status(404).send({ error: 'Course not updated' });
                res.send({ message: 'Course updated' });
            } catch {
                res.status(500).send({ error: 'Update failed' });
            }
        });

        app.delete('/courses/:id', async (req, res) => {
            try {
                const result = await coursesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
                if (result.deletedCount === 0) return res.status(404).json({ message: 'Course not found' });
                res.send({ message: 'Course deleted successfully' });
            } catch (err) {
                console.error('❌ Error deleting course:', err);
                res.status(500).json({ error: 'Failed to delete course' });
            }
        });

        // --- Enrollment Routes ---
        app.post('/enrollments', verifyJWT, async (req, res) => {
            try {
                const decoded = req.decoded;
                const { userEmail, courseId, courseTitle } = req.body;

                if (decoded.email !== userEmail) {
                    return res.status(403).json({ error: 'Unauthorized email' });
                }

                const existing = await enrollmentsCollection.findOne({ userEmail, courseId });
                if (existing) {
                    return res.status(400).json({ error: 'Already enrolled', enrolledId: existing._id });
                }

                const userEnrollments = await enrollmentsCollection.find({ userEmail }).toArray();
                if (userEnrollments.length >= 3) {
                    return res.status(400).json({ error: 'Max 3 enrollments allowed' });
                }

                const course = await coursesCollection.findOne({ _id: new ObjectId(courseId) });
                if (!course) return res.status(404).json({ error: 'Course not found' });

                if (course.seats <= 0) {
                    return res.status(400).json({ error: 'No seats left' });
                }

                const result = await enrollmentsCollection.insertOne({
                    userEmail,
                    courseId,
                    courseTitle,
                    enrolledAt: new Date(),
                });

                await coursesCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    { $inc: { seats: -1 } }
                );

                res.status(201).json({ message: 'Enrolled successfully', enrolledId: result.insertedId });
            } catch (err) {
                console.error('❌ Enroll error:', err);
                res.status(500).json({ error: 'Enrollment failed' });
            }
        });
        // enrolled-status added
        app.get('/enrolled-status', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const { email, courseId } = req.query;

            if (decoded.email !== email) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }

            try {
                const enrollment = await enrollmentsCollection.findOne({ userEmail: email, courseId });
                if (enrollment) {
                    return res.json({ enrolled: true, enrollmentId: enrollment._id });
                } else {
                    return res.json({ enrolled: false });
                }
            } catch (err) {
                console.error('❌ Enrolled status error:', err);
                res.status(500).json({ error: 'Check failed' });
            }
        });

        app.get('/my-enrolled-courses/:email', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const email = req.params.email;
            if (decoded.email !== email) return res.status(403).json({ error: 'Unauthorized access' });

            try {
                const enrollments = await enrollmentsCollection
                    .find({ userEmail: email })
                    .project({ _id: 1, userEmail: 1, courseId: 1, courseTitle: 1, enrolledAt: 1 })
                    .toArray();

                const formatted = enrollments.map(enroll => ({
                    ...enroll,
                    timestamp: enroll.enrolledAt,
                }));

                res.json(formatted);
            } catch (err) {
                console.error('❌ Fetch enrollments failed:', err);
                res.status(500).json({ error: 'Failed to fetch enrollments' });
            }
        });

        // ✅ PATCH: Update seats for a course (Better Practice: Backend handles seat change)
        app.patch('/courses/:id/seats', verifyJWT, async (req, res) => {
            const { id } = req.params;
            const { increment } = req.body; // expected: +1 or -1

            if (typeof increment !== 'number') {
                return res.status(400).json({ error: 'Missing or invalid increment value' });
            }

            try {
                const result = await coursesCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $inc: { seats: increment } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({ error: 'Course not found or seat not updated' });
                }

                res.json({ message: 'Seat count updated successfully' });
            } catch (err) {
                console.error('❌ Seat update failed:', err);
                res.status(500).json({ error: 'Seat update failed' });
            }
        });

        // Unenroll a user from a course (toggle off)
        // ✅ Unenroll route now protected with verifyJWT
        app.delete('/enrollments/:email/:courseId', verifyJWT, async (req, res) => {
            const { email, courseId } = req.params;
            const decoded = req.decoded;

            if (decoded.email !== email) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }

            try {
                const result = await enrollmentsCollection.deleteOne({ userEmail: email, courseId });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: 'Enrollment not found' });
                }

                await coursesCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    { $inc: { seats: 1 } }
                );

                res.json({ message: 'Enrollment cancelled and seat updated' });
            } catch (err) {
                console.error('Error in unenrollment:', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // --- User Routes ---

        // Get single user by email
        app.get('/users/:email', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const { email } = req.params;

            if (decoded.email !== email) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }

            const user = await usersCollection.findOne({ email });
            res.json(user || {});
        });

        // Update user profile (MongoDB)
        app.put('/users/:email', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            const { email } = req.params;
            const data = req.body;

            if (decoded.email !== email) {
                return res.status(403).json({ error: 'Unauthorized access' });
            }

            const updatedUser = {
                $set: {
                    name: data.name,
                    photoURL: data.photoURL,
                    phone: data.phone || "",
                    address: data.address || "",
                    updatedAt: new Date(),
                },
            };

            const result = await usersCollection.updateOne({ email }, updatedUser, { upsert: true });
            res.json({ message: "User info updated successfully", result });
        });



        // ✅ NEW DELETE ROUTE TO FIX FRONTEND ERROR


        app.get('/popular-courses', async (req, res) => {
            try {
                const pipeline = [
                    { $group: { _id: "$courseId", enrollCount: { $sum: 1 } } },
                    { $sort: { enrollCount: -1 } },
                    { $limit: 5 },
                    { $addFields: { courseObjectId: { $toObjectId: "$_id" } } },
                    {
                        $lookup: {
                            from: "courses",
                            localField: "courseObjectId",
                            foreignField: "_id",
                            as: "course"
                        }
                    },
                    { $unwind: "$course" },
                    {
                        $project: {
                            _id: "$course._id",
                            courseTitle: "$course.courseTitle",
                            imageURL: "$course.imageURL",
                            timestamp: "$course.timestamp",
                            enrollCount: 1
                        }
                    }
                ];
                const popular = await enrollmentsCollection.aggregate(pipeline).toArray();
                res.json(popular);
            } catch (err) {
                console.error('❌ Popular courses error:', err);
                res.status(500).json({ error: 'Fetch popular courses failed' });
            }
        });

    } catch (err) {
        console.error("❌ Server Error:", err);
    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
