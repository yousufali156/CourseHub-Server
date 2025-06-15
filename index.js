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

        // 🔹 Get Single Course
        app.get('/courses/:id', async (req, res) => {
            try {
                const courseId = req.params.id;
                const course = await coursesCollection.findOne({ _id: new ObjectId(courseId) });
                if (!course) return res.status(404).json({ error: 'Course not found' });
                res.json(course);
            } catch (error) {
                res.status(500).json({ error: 'Failed to fetch course' });
            }
        });

        // 🔹 Add New Course
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

        // 🔹 Update Course
        app.put('/course/:id', async (req, res) => {
            try {
                const updatedData = req.body;
                const result = await coursesCollection.updateOne(
                    { _id: new ObjectId(req.params.id) },
                    { $set: { ...updatedData, updatedAt: new Date() } }
                );
                if (result.modifiedCount === 0) return res.status(404).send({ error: 'Course not updated' });
                res.send({ message: 'Course updated' });
            } catch (error) {
                res.status(500).send({ error: 'Update failed' });
            }
        });

        // 🔹 Delete Course
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

        // 🔹 Enroll API
        app.post('/enrollments', async (req, res) => {
            try {
                const { userEmail, courseId, courseTitle } = req.body;

                if (!userEmail || !courseId) {
                    return res.status(400).json({ error: 'Missing required fields' });
                }

                const existing = await enrollmentsCollection.findOne({ userEmail, courseId });
                if (existing) {
                    return res.status(400).json({ error: 'Already enrolled in this course' });
                }

                const userEnrollments = await enrollmentsCollection.find({ userEmail }).toArray();
                if (userEnrollments.length >= 3) {
                    return res.status(400).json({ error: 'Cannot enroll in more than 3 courses' });
                }

                const course = await coursesCollection.findOne({ _id: new ObjectId(courseId) });
                if (!course) return res.status(404).json({ error: 'Course not found' });

                if (course.seats <= 0) {
                    return res.status(400).json({ error: 'No seats left' });
                }

                await enrollmentsCollection.insertOne({
                    userEmail,
                    courseId,
                    courseTitle,
                    enrolledAt: new Date(),
                });

                await coursesCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    { $inc: { seats: -1 } }
                );

                res.status(201).json({ message: 'Enrolled successfully' });
            } catch (error) {
                console.error('Enroll API error:', error);
                res.status(500).json({ error: 'Enrollment failed' });
            }
        });

        // 🔹 ✅ Unenroll using body data
        app.delete('/enrollments', async (req, res) => {
            const { userEmail, courseId } = req.body;

            if (!userEmail || !courseId) {
                return res.status(400).json({ error: 'userEmail and courseId are required' });
            }

            try {
                const result = await enrollmentsCollection.deleteOne({ userEmail, courseId });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: 'Enrollment not found' });
                }

                // Increase seat count in course
                await coursesCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    { $inc: { seats: 1 } }
                );

                res.json({ message: 'Unenrolled successfully and seat count updated' });
            } catch (err) {
                console.error('❌ Failed to unenroll:', err);
                res.status(500).json({ error: 'Failed to unenroll' });
            }
        });

        // Example Express route
app.delete("/enrollments/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.collection("enrollments").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) {
      res.status(200).send({ message: "Deleted successfully" });
    } else {
      res.status(404).send({ message: "Enrollment not found" });
    }
  } catch (err) {
    res.status(500).send({ message: "Server error" });
  }
});


        // 🔹 Get enrolled courses by user email
        app.get('/my-enrolled-courses/:email', async (req, res) => {
            const { email } = req.params;

            try {
                const enrollments = await enrollmentsCollection
                    .find({ userEmail: email })
                    .toArray();

                res.json(enrollments);
            } catch (err) {
                console.error('Failed to fetch enrollments:', err);
                res.status(500).json({ error: 'Failed to fetch enrollments' });
            }
        });

        // 🔹 Unenroll (older route)
        app.delete('/my-enrolled-courses/:email/:courseId', async (req, res) => {
            const { email, courseId } = req.params;

            try {
                const result = await enrollmentsCollection.deleteOne({ userEmail: email, courseId });
                res.json({ success: result.deletedCount > 0 });
            } catch (err) {
                console.error('Failed to remove enrollment:', err);
                res.status(500).json({ error: 'Failed to remove enrollment' });
            }
        });

        // 🔹 Increase seat count after unenroll
        app.patch('/courses/:id/seats', async (req, res) => {
            const courseId = req.params.id;
            const increment = req.body.increment || 1;

            try {
                const result = await coursesCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    { $inc: { seats: increment } }
                );

                res.json({ success: true, modifiedCount: result.modifiedCount });
            } catch (err) {
                console.error('Failed to update seat count:', err);
                res.status(500).json({ error: 'Failed to update seat count' });
            }
        });

        // 🔹 Popular Courses
app.get('/popular-courses', async (req, res) => {
  try {
    const pipeline = [
      {
        $group: {
          _id: "$courseId",
          enrollCount: { $sum: 1 }
        }
      },
      { $sort: { enrollCount: -1 } },
      { $limit: 5 },
      {
        $addFields: {
          courseObjectId: { $toObjectId: "$_id" } // convert string to ObjectId
        }
      },
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

    const popularCourses = await enrollmentsCollection.aggregate(pipeline).toArray();
    res.json(popularCourses);
  } catch (error) {
    console.error('❌ Failed to fetch popular courses:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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
