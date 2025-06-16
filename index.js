const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3000;

// 🔹 Middleware
app.use(cors());
app.use(express.json());

// 🔹 Firebase Admin Initialization
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// 🔹 MongoDB Connection
const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@cluster0.mr3w9gn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

let db, coursesCollection, usersCollection, enrollmentsCollection;

// 🔸 Main Function
async function run() {
    try {
        await client.connect();
        db = client.db('coursehub_db');
        coursesCollection = db.collection('courses');
        usersCollection = db.collection('users');
        enrollmentsCollection = db.collection('enrollments');

        console.log("✅ MongoDB connected. Server ready.");

        // 🔹 Health Check Route
        app.get('/', (req, res) => {
            res.send('✅ CourseHub Server is Running!');
        });

        // 🔹 Course Routes
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

        // 🔹 Enrollment Routes
        app.post('/enrollments', async (req, res) => {
            try {
                const { userEmail, courseId, courseTitle } = req.body;

                if (!userEmail || !courseId) return res.status(400).json({ error: 'Missing required fields' });

                const existing = await enrollmentsCollection.findOne({ userEmail, courseId });
                if (existing) return res.status(400).json({ error: 'Already enrolled' });

                const userEnrollments = await enrollmentsCollection.find({ userEmail }).toArray();
                if (userEnrollments.length >= 3) return res.status(400).json({ error: 'Max 3 enrollments allowed' });

                const course = await coursesCollection.findOne({ _id: new ObjectId(courseId) });
                if (!course) return res.status(404).json({ error: 'Course not found' });
                if (course.seats <= 0) return res.status(400).json({ error: 'No seats left' });

                await enrollmentsCollection.insertOne({ userEmail, courseId, courseTitle, enrolledAt: new Date() });

                await coursesCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    { $inc: { seats: -1 } }
                );

                res.status(201).json({ message: 'Enrolled successfully' });
            } catch (err) {
                console.error('❌ Enroll error:', err);
                res.status(500).json({ error: 'Enrollment failed' });
            }
        });

        app.delete('/enrollments', async (req, res) => {
            const { userEmail, courseId } = req.body;
            if (!userEmail || !courseId) return res.status(400).json({ error: 'Missing data' });

            try {
                const result = await enrollmentsCollection.deleteOne({ userEmail, courseId });
                if (result.deletedCount === 0) return res.status(404).json({ error: 'Enrollment not found' });

                await coursesCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    { $inc: { seats: 1 } }
                );

                res.json({ message: 'Unenrolled successfully' });
            } catch (err) {
                console.error('❌ Unenroll failed:', err);
                res.status(500).json({ error: 'Unenrollment failed' });
            }
        });

        app.delete('/enrollments/:id', async (req, res) => {
            try {
                const result = await enrollmentsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
                if (result.deletedCount === 0) return res.status(404).json({ message: 'Enrollment not found' });
                res.status(200).send({ message: "Deleted successfully" });
            } catch {
                res.status(500).send({ message: "Server error" });
            }
        });

        app.get('/my-enrolled-courses/:email', async (req, res) => {
            try {
                const enrollments = await enrollmentsCollection
                    .find({ userEmail: req.params.email })
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

        app.delete('/my-enrolled-courses/:email/:courseId', async (req, res) => {
            try {
                const result = await enrollmentsCollection.deleteOne({
                    userEmail: req.params.email,
                    courseId: req.params.courseId
                });
                res.json({ success: result.deletedCount > 0 });
            } catch (err) {
                res.status(500).json({ error: 'Unenroll failed' });
            }
        });

        app.patch('/courses/:id/seats', async (req, res) => {
            const increment = req.body.increment || 1;
            try {
                const result = await coursesCollection.updateOne(
                    { _id: new ObjectId(req.params.id) },
                    { $inc: { seats: increment } }
                );
                res.json({ success: true, modifiedCount: result.modifiedCount });
            } catch (err) {
                res.status(500).json({ error: 'Seat update failed' });
            }
        });

        app.get('/courses/:id/with-seat-info', async (req, res) => {
            try {
                const course = await coursesCollection.findOne({ _id: new ObjectId(req.params.id) });
                if (!course) return res.status(404).json({ error: 'Course not found' });

                const enrollCount = await enrollmentsCollection.countDocuments({ courseId: req.params.id });
                const seatsLeft = course.seats - enrollCount;

                res.json({ ...course, seatsLeft });
            } catch (err) {
                res.status(500).json({ error: 'Seat info fetch failed' });
            }
        });

        // 🔹 Popular Courses
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

// 🔹 Start Server
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
