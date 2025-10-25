

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config(); // Ensure dotenv is configured early
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin'); // Use Firebase Admin SDK
const jwt = require('jsonwebtoken');

// --- Stripe Initialization with check ---
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log("✅ Stripe Initialized.");
} else {
    console.warn("⚠️ Stripe Secret Key not found. Payment routes will be disabled.");
    stripe = { paymentIntents: { create: () => Promise.reject(new Error("Stripe not configured.")) } };
}

const app = express();
const port = process.env.PORT || 3000;

// --- CORS Configuration ---
app.use(cors({
    origin: [
        process.env.CLIENT_URL, // Keep Vercel Env Var
        'http://localhost:5173', // For local development
        'https://coursehub-7fd47.web.app' // Add your live frontend URL directly
    ],
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());

// --- Correct Firebase Admin Initialization ---
try {
    if (admin.apps.length === 0) { // Check if no apps exist
        const serviceAccount = require('./serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log("✅ Firebase Admin Initialized.");
    } else {
        admin.app(); // Get the existing default app
        console.log("✅ Firebase Admin already initialized, reusing.");
    }
} catch (error) {
    console.error("❌ Firebase Admin Initialization Failed:", error);
    process.exit(1); // Exit if it fails on the first try
}


// --- MongoDB Setup ---
const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@cluster0.mr3w9gn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

// --- Global variable for DB connection status ---
let isDbConnected = false;
let db, coursesCollection, usersCollection, enrollmentsCollection, reviewsCollection;

// --- Middleware ---

// JWT Verification Middleware
const verifyJWT = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).send({ error: true, message: 'Unauthorized: No token provided.' });
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error("❌ JWT Verification Error:", err.message);
            res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', path: '/' });
            return res.status(403).send({ error: true, message: 'Forbidden: Invalid or expired token.' });
        }
        req.decoded = decoded; // Contains { email, uid }
        next();
    });
};

// Middleware 1: Check DB Connection
const checkDbConnection = (req, res, next) => {
    if (!isDbConnected || !client) {
        console.error("❌ Database not connected or collections not ready.");
        return res.status(503).send({ error: true, message: 'Service temporarily unavailable. Please try again shortly.' });
    }
    db = client.db('coursehub_db');
    coursesCollection = db.collection('courses');
    usersCollection = db.collection('users');
    enrollmentsCollection = db.collection('enrollments');
    reviewsCollection = db.collection('reviews');
    next();
};

// Middleware 2: Get User Role (Use ONLY AFTER verifyJWT and checkDbConnection)
const getUserRole = async (req, res, next) => {
    if (!req.decoded?.email) {
        return res.status(401).send({ error: true, message: 'Unauthorized: Missing user email in token.' });
    }
    try {
        const user = await usersCollection.findOne({ email: req.decoded.email });
        req.userRole = user?.role || 'student';
        next();
    } catch (dbErr) {
        console.error("❌ Error fetching user role:", dbErr);
        res.status(500).send({ error: true, message: 'Server error checking user role.' });
    }
};

// Middleware 3: Get Role IF Authenticated (For Public Routes)
const getRoleIfAuthenticated = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        req.userRole = 'guest';
        return next();
    }
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            req.userRole = 'guest';
            res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', path: '/' });
            return next();
        }
        req.decoded = decoded;
        try {
            if (!isDbConnected || !usersCollection) {
                 console.error("❌ DB not connected for getRoleIfAuthenticated");
                 req.userRole = 'guest';
                 return next();
            }
            const user = await usersCollection.findOne({ email: req.decoded.email });
            req.userRole = user?.role || 'student';
            next();
        } catch (dbErr) {
            console.error("❌ Error fetching user role (getRoleIfAuthenticated):", dbErr);
            req.userRole = 'guest';
            next();
        }
    });
};

// Middleware to Verify Admin Role
const verifyAdmin = (req, res, next) => {
    if (req.userRole !== 'admin') {
        return res.status(403).send({ error: true, message: 'Forbidden: Requires Admin role.' });
    }
    next();
};

// Middleware to Verify Instructor Role (or Admin)
const verifyInstructor = (req, res, next) => {
    if (req.userRole !== 'instructor' && req.userRole !== 'admin') {
        return res.status(403).send({ error: true, message: 'Forbidden: Requires Instructor or Admin role.' });
    }
    next();
};

// --- Main Async Function to Setup DB and Routes ---
async function run() {
    try {
        // await client.connect(); // Commented out
        db = client.db('coursehub_db');
        coursesCollection = db.collection('courses');
        usersCollection = db.collection('users');
        enrollmentsCollection = db.collection('enrollments');
        reviewsCollection = db.collection('reviews');
        
        // await client.db("admin").command({ ping: 1 }); // Commented out
        isDbConnected = true;
        console.log("✅ MongoDB collections initialized!");

        // --- Authentication Routes ---
        app.post('/jwt', async (req, res) => {
             const { token: firebaseToken } = req.body;
             if (!firebaseToken) return res.status(400).send({ error: true, message: "Missing Firebase ID token" });
             try {
                 const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
                 if (!decodedToken.email) return res.status(401).send({ error: true, message: "Firebase token is missing email." });
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

        app.post('/logout', (req, res) => {
             try {
                 res.clearCookie('token', {
                     httpOnly: true,
                     secure: process.env.NODE_ENV === 'production',
                     sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                     path: '/'
                 });
                 res.send({ success: true });
             } catch (err) {
                 console.error("❌ Logout error:", err);
                 res.status(500).send({ error: true, message: "Logout failed" });
             }
        });

        // --- User Routes ---
        app.get('/users/:email', verifyJWT, checkDbConnection, getUserRole, async (req, res) => {
             const emailParam = req.params.email;
             if (req.decoded.email !== emailParam) return res.status(403).json({ error: 'Forbidden' });
            try {
                 const user = await usersCollection.findOne({ email: emailParam });
                 res.json(user || { email: emailParam, role: 'student' });
            } catch (err) {
                 console.error("❌ Error fetching user profile data:", err);
                 res.status(500).json({ error: 'Failed to fetch user profile.' });
            }
        });

        app.put('/users/:email', verifyJWT, checkDbConnection, async (req, res) => {
             const emailParam = req.params.email;
             const userData = req.body;
             if (req.decoded.email !== emailParam) return res.status(403).json({ error: 'Forbidden' });
             if (!userData.name || !userData.photoURL) return res.status(400).json({ error: 'Name and photoURL are required.' });
             const filter = { email: emailParam };
             const updateDoc = {
                 $set: {
                     name: userData.name, photoURL: userData.photoURL,
                     phone: userData.phone || "", address: userData.address || "",
                     updatedAt: new Date(),
                 },
                 $setOnInsert: { email: emailParam, role: 'student', createdAt: new Date() }
             };
             const options = { upsert: true };
            try {
                 const result = await usersCollection.updateOne(filter, updateDoc, options);
                 if (result.upsertedCount > 0) res.status(201).json({ message: "Profile created.", result });
                 else if (result.modifiedCount > 0) res.status(200).json({ message: "Profile updated.", result });
                 else res.status(200).json({ message: "No changes detected.", result });
            } catch (err) {
                 console.error("❌ Error updating user:", err);
                 res.status(500).json({ error: 'Failed to update user profile.' });
            }
        });

        // --- Course Routes ---
        
        // (FIXED) GET Courses - Public, but role-aware
        app.get('/courses', checkDbConnection, getRoleIfAuthenticated, async (req, res) => {
             try {
                 const { instructorEmail, search } = req.query;
                 let query = {};

                 // (FIXED) Non-admins/guests see 'approved' OR courses with NO status field
                 if (req.userRole !== 'admin') {
                     query.$or = [
                         { status: 'approved' },
                         { status: { $exists: false } } // Show old courses
                     ];
                 }
                 // Admins see all

                 if (instructorEmail && instructorEmail !== 'null' && instructorEmail !== 'undefined') {
                     query.instructorEmail = instructorEmail;
                 }
                 
                 if (search) {
                     const searchRegex = { $regex: search, $options: 'i' };
                     const searchCondition = { $or: [{ courseTitle: searchRegex }, { description: searchRegex }] };
                     
                     // Combine search with existing query
                     if(query.$or || query.instructorEmail) {
                         query = { $and: [query, searchCondition] };
                     } else {
                         query = searchCondition; // Only search query
                     }
                 }
                 
                 const sortOptions = { createdAt: -1 }; // Use createdAt if timestamp isn't standardized
                 
                 const result = await coursesCollection.find(query).sort(sortOptions).toArray();
                 res.send(result);

             } catch (err) {
                 console.error("❌ Error fetching courses:", err);
                 res.status(500).json({ error: 'Failed to fetch courses' });
             }
        });

        // (FIXED) GET Single Course by ID (Public, but check status)
        app.get('/courses/:id', checkDbConnection, getRoleIfAuthenticated, async (req, res) => {
              const { id } = req.params;
              if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' });
              const courseObjectId = new ObjectId(id);
            try {
                  const pipeline = [
                      { $match: { _id: courseObjectId } },
                      { $lookup: { from: "reviews", localField: "_id", foreignField: "courseObjectId", as: "courseReviews" } },
                      { $addFields: {
                          averageRating: { $cond: { if: { $gt: [{ $size: "$courseReviews" }, 0] }, then: { $avg: "$courseReviews.rating" }, else: 0 } },
                          reviewCount: { $size: "$courseReviews" }
                      }},
                      { $project: { courseReviews: 0 } }
                  ];
                  const result = await coursesCollection.aggregate(pipeline).toArray();
                  if (result.length === 0) return res.status(404).json({ error: 'Course not found' });
                  
                  const course = result[0];

                  // (FIXED) Public/Students can only see 'approved' or no-status courses
                  const hasStatus = course.status !== undefined;
                  if (hasStatus && course.status !== 'approved' && req.userRole !== 'admin') {
                       return res.status(404).json({ error: 'Course not found or not available.' });
                  }
                  
                  res.json(course);
              } catch (err) {
                   console.error("❌ Error fetching single course:", err);
                   res.status(500).json({ error: 'Failed to fetch course details' });
              }
          });

        // POST Add New Course
        app.post('/courses', verifyJWT, checkDbConnection, getUserRole, verifyInstructor, async (req, res) => {
               const { courseTitle, image, seats, duration, description, instructorEmail, timestamp, price } = req.body;
               const requestingUserEmail = req.decoded.email;
               if (!courseTitle || !image || seats == null || !duration || !description || price == null) return res.status(400).json({ error: 'Missing required fields.' });
               if (isNaN(parseInt(seats, 10)) || isNaN(parseFloat(price)) || parseFloat(price) < 0 || parseInt(seats, 10) < 0) return res.status(400).json({ error: 'Invalid Seats or Price.' });
               let finalInstructorEmail = (req.userRole === 'instructor') ? requestingUserEmail : instructorEmail;
               if (req.userRole === 'admin' && !instructorEmail) return res.status(400).json({ error: 'Admin must specify instructorEmail.' });
            try {
               const newCourse = {
                   courseTitle, image, seats: parseInt(seats, 10), price: parseFloat(price),
                   duration, description, instructorEmail: finalInstructorEmail,
                   enrollmentCount: 0, status: 'pending',
                   createdAt: timestamp ? new Date(timestamp) : new Date(), updatedAt: new Date(),
                   // (FIX) Add timestamp field to match your old data structure if needed
                   timestamp: timestamp || new Date().toISOString().split('T')[0] // 'YYYY-MM-DD'
               };
               const result = await coursesCollection.insertOne(newCourse);
               res.status(201).json({ message: 'Course added, pending approval.', insertedId: result.insertedId });
            } catch (err) {
               console.error('❌ Error adding course:', err);
               res.status(500).json({ error: 'Failed to add course' });
            }
         });

        // PUT Update Course
        app.put('/course/:id', verifyJWT, checkDbConnection, getUserRole, verifyInstructor, async (req, res) => {
              const { id } = req.params;
              const updatedData = req.body;
              const requestingUserEmail = req.decoded.email;
              if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' });
              const courseObjectId = new ObjectId(id);
            try {
                 const existingCourse = await coursesCollection.findOne({ _id: courseObjectId });
                 if (!existingCourse) return res.status(404).send({ error: 'Course not found' });
                 if (req.userRole === 'instructor' && existingCourse.instructorEmail !== requestingUserEmail) {
                    return res.status(403).send({ error: 'Forbidden: Not your course' });
                 }
                 delete updatedData._id; delete updatedData.instructorEmail; delete updatedData.createdAt;
                 delete updatedData.enrollmentCount; delete updatedData.status; delete updatedData.averageRating; delete updatedData.reviewCount;
                 if (updatedData.seats !== undefined) {
                    const seatsNum = parseInt(updatedData.seats, 10);
                    if (isNaN(seatsNum) || seatsNum < 0) return res.status(400).json({ error: 'Invalid Seats.'});
                    updatedData.seats = seatsNum;
                 }
                 if (updatedData.price !== undefined) {
                    const priceNum = parseFloat(updatedData.price);
                    if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Invalid Price.'});
                    updatedData.price = priceNum;
                 }
                 const result = await coursesCollection.updateOne(
                     { _id: courseObjectId }, { $set: { ...updatedData, updatedAt: new Date() } }
                 );
                 if (result.matchedCount === 0) return res.status(404).send({ error: 'Course not found' });
                 if (result.modifiedCount === 0) return res.status(200).send({ message: 'No changes detected' });
                 res.send({ message: 'Course updated successfully' });
             } catch (err) {
                  console.error("❌ Error updating course:", err);
                  res.status(500).send({ error: 'Course update failed' });
             }
         });

        // DELETE Course
        app.delete('/courses/:id', verifyJWT, checkDbConnection, getUserRole, verifyInstructor, async (req, res) => {
             const { id } = req.params;
             const requestingUserEmail = req.decoded.email;
             if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' });
             const courseObjectId = new ObjectId(id);
            try {
                 const existingCourse = await coursesCollection.findOne({ _id: courseObjectId });
                 if (!existingCourse) return res.status(404).json({ message: 'Course not found' });
                 if (req.userRole === 'instructor' && existingCourse.instructorEmail !== requestingUserEmail) {
                    return res.status(403).send({ error: 'Forbidden: Not your course' });
                 }
                 const deleteResult = await coursesCollection.deleteOne({ _id: courseObjectId });
                 if (deleteResult.deletedCount === 0) return res.status(404).json({ message: 'Delete failed' });
                 await enrollmentsCollection.deleteMany({ courseId: id });
                 await reviewsCollection.deleteMany({ courseObjectId: courseObjectId });
                 res.send({ message: 'Course and related data deleted' });
              } catch (err) {
                  console.error('❌ Error deleting course:', err);
                  res.status(500).json({ error: 'Failed to delete course' });
              }
         });

        // --- Enrollment Routes ---
        app.post('/enrollments', verifyJWT, checkDbConnection, getUserRole, async (req, res) => {
               const { userEmail, courseId, courseTitle } = req.body;
               const requestingUserEmail = req.decoded.email;
               if (!userEmail || !courseId || !courseTitle) return res.status(400).json({ error: 'Missing details' });
               if (requestingUserEmail !== userEmail) return res.status(403).json({ error: 'Email mismatch' });
               if (!ObjectId.isValid(courseId)) return res.status(400).json({ error: 'Invalid Course ID' });
               const courseObjectId = new ObjectId(courseId);
            try {
                  const existing = await enrollmentsCollection.findOne({ userEmail, courseId });
                  if (existing) return res.status(400).json({ error: 'Already enrolled' });
                  const count = await enrollmentsCollection.countDocuments({ userEmail });
                  if (count >= 3) return res.status(400).json({ error: 'Enrollment limit' });
                  const course = await coursesCollection.findOne({ _id: courseObjectId });
                  if (!course) return res.status(404).json({ error: 'Course not found' });
                  // (FIX) Check status OR existence
                  const hasStatus = course.status !== undefined;
                  if (hasStatus && course.status !== 'approved') return res.status(400).json({ error: 'Course not approved' });
                  
                  if (course.seats <= 0) return res.status(400).json({ error: 'No seats available' });
                  const enrollmentResult = await enrollmentsCollection.insertOne({ userEmail, courseId, courseTitle, enrolledAt: new Date() });
                  const updateResult = await coursesCollection.updateOne(
                      { _id: courseObjectId, seats: { $gt: 0 } },
                      { $inc: { seats: -1, enrollmentCount: 1 } }
                  );
                   if (updateResult.modifiedCount === 0) {
                       await enrollmentsCollection.deleteOne({ _id: enrollmentResult.insertedId });
                       return res.status(409).json({ error: 'Seat conflict' });
                   }
                  res.status(201).json({ message: 'Enrolled', enrolledId: enrollmentResult.insertedId });
             } catch (err) {
                 console.error('❌ Enrollment error:', err);
                 res.status(500).json({ error: 'Enrollment failed' });
             }
         });

         app.get('/enrolled-status', verifyJWT, checkDbConnection, async (req, res) => {
               const { email, courseId } = req.query;
               if (!email || !courseId) return res.status(400).json({ error: 'Missing params' });
               if (req.decoded.email !== email) return res.status(403).json({ error: 'Unauthorized' });
             try {
               const enrollment = await enrollmentsCollection.findOne({ userEmail: email, courseId: courseId });
               res.json({ enrolled: !!enrollment, enrollmentId: enrollment?._id });
             } catch (err) {
                 console.error('❌ Error checking enrollment status:', err);
                 res.status(500).json({ error: 'Status check failed' });
             }
          });

          app.get('/my-enrolled-courses/:email', verifyJWT, checkDbConnection, async (req, res) => {
               const emailParam = req.params.email;
               if (req.decoded.email !== emailParam) return res.status(403).json({ error: 'Unauthorized' });
             try {
               const enrollments = await enrollmentsCollection
                   .find({ userEmail: emailParam })
                   .project({ courseId: 1, courseTitle: 1, enrolledAt: 1 })
                   .sort({ enrolledAt: -1 })
                   .toArray();
               res.json(enrollments);
             } catch (err) {
                 console.error('❌ Fetch user enrollments failed:', err);
                 res.status(500).json({ error: 'Fetch failed' });
             }
          });

          app.delete('/enrollments/:email/:courseId', verifyJWT, checkDbConnection, async (req, res) => {
                 const { email, courseId } = req.params;
                 if (req.decoded.email !== email) return res.status(403).json({ error: 'Unauthorized' });
                 if (!ObjectId.isValid(courseId)) return res.status(400).json({ error: 'Invalid ID' });
                 const courseObjectId = new ObjectId(courseId);
             try {
                 const deleteResult = await enrollmentsCollection.deleteOne({ userEmail: email, courseId: courseId });
                 if (deleteResult.deletedCount === 0) return res.status(404).json({ error: 'Not enrolled' });
                 await coursesCollection.updateOne(
                     { _id: courseObjectId },
                     { $inc: { seats: 1, enrollmentCount: -1 } }
                 );
                 res.json({ message: 'Unenrolled' });
              } catch (err) {
                  console.error('❌ Error during unenrollment:', err);
                  res.status(500).json({ error: 'Unenroll failed' });
              }
          });

        // --- Admin Routes ---
        app.get('/admin/users', verifyJWT, checkDbConnection, getUserRole, verifyAdmin, async (req, res) => {
             try {
                 const users = await usersCollection.find({}, { projection: { password: 0 } }).toArray();
                 res.json(users);
             } catch (err) {
                 console.error("❌ Error fetching users for admin:", err);
                 res.status(500).json({ error: 'Fetch failed' });
             }
         });

         app.patch('/admin/users/:email/role', verifyJWT, checkDbConnection, getUserRole, verifyAdmin, async (req, res) => {
              const { email } = req.params;
              const { role } = req.body;
              if (!['student', 'instructor', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
             try {
                  const result = await usersCollection.updateOne({ email }, { $set: { role: role } });
                  if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
                  res.json({ message: `Role updated to ${role}` });
              } catch (err) {
                  console.error("❌ Error updating user role:", err);
                  res.status(500).json({ error: 'Update failed' });
              }
          });

          app.get('/admin/courses', verifyJWT, checkDbConnection, getUserRole, verifyAdmin, async (req, res) => {
              try {
                  const courses = await coursesCollection.find({}).sort({ createdAt: -1 }).toArray();
                  res.json(courses);
              } catch (err) {
                  console.error("❌ Error fetching all courses for admin:", err);
                  res.status(500).json({ error: 'Fetch failed' });
              }
          });

          app.patch('/admin/courses/:id/status', verifyJWT, checkDbConnection, getUserRole, verifyAdmin, async (req, res) => {
               const { id } = req.params;
               const { status } = req.body;
               if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
               if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' });
             try {
                   const result = await coursesCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: status } });
                   if (result.matchedCount === 0) return res.status(404).json({ error: 'Course not found' });
                   res.json({ message: `Status updated to ${status}` });
               } catch (err) {
                   console.error("❌ Error updating course status:", err);
                   res.status(500).json({ error: 'Update failed' });
               }
           });

        // --- Payment Route ---
        app.post('/create-payment-intent', verifyJWT, checkDbConnection, async (req, res) => {
             const { courseId } = req.body;
             const userEmail = req.decoded.email;
             if (!ObjectId.isValid(courseId)) return res.status(400).json({ error: 'Invalid ID' });
             const courseObjectId = new ObjectId(courseId);
             try {
                 const course = await coursesCollection.findOne({ _id: courseObjectId });
                 if (!course) return res.status(404).send({ error: "Course not found" });
                 // (FIX) Check status OR existence
                 const hasStatus = course.status !== undefined;
                 if (hasStatus && course.status !== 'approved') return res.status(400).json({ error: 'Course not approved' });
                 
                 if (course.seats <= 0) return res.status(400).json({ error: 'No seats' });
                 const price = course.price;
                 if (price == null || price <= 0) return res.status(400).send({ error: "Invalid price" });
                 const existingEnrollment = await enrollmentsCollection.findOne({ userEmail, courseId });
                 if (existingEnrollment) return res.status(400).send({ error: "Already enrolled" });
                 const amountInSmallestUnit = Math.round(price * 100);
                 const paymentIntent = await stripe.paymentIntents.create({
                     amount: amountInSmallestUnit, currency: "usd",
                     automatic_payment_methods: { enabled: true },
                     metadata: { courseId: courseId, userEmail: userEmail }
                 });
                 res.send({ clientSecret: paymentIntent.client_secret });
              } catch (err) {
                  console.error("❌ Payment Intent Error:", err);
                  res.status(500).send({ error: "Payment setup failed" });
              }
         });

         // --- Review Routes ---
         app.post('/courses/:id/reviews', verifyJWT, checkDbConnection, async (req, res) => {
              const courseIdParam = req.params.id;
              const { rating, comment } = req.body;
              const userEmail = req.decoded.email;
              if (!ObjectId.isValid(courseIdParam)) return res.status(400).json({ error: 'Invalid ID' });
              const courseObjectId = new ObjectId(courseIdParam);
              if (rating == null || typeof rating !== 'number' || rating < 1 || rating > 5) return res.status(400).json({ error: 'Invalid rating' });
              if (!comment || typeof comment !== 'string' || comment.trim().length === 0) return res.status(400).json({ error: 'Comment required' });
             try {
                  const enrollment = await enrollmentsCollection.findOne({ userEmail: userEmail, courseId: courseIdParam });
                  if (!enrollment) return res.status(403).json({ error: 'Must be enrolled' });
                  const existingReview = await reviewsCollection.findOne({ userEmail: userEmail, courseObjectId: courseObjectId });
                  if (existingReview) return res.status(400).json({ error: 'Already reviewed' });
                  const userProfile = await usersCollection.findOne({ email: userEmail });
                  const newReview = {
                      courseObjectId: courseObjectId, courseId: courseIdParam,
                      userEmail: userEmail, userName: userProfile?.name || userEmail,
                      userPhoto: userProfile?.photoURL || null,
                      rating: rating, comment: comment.trim(), createdAt: new Date()
                  };
                  const result = await reviewsCollection.insertOne(newReview);
                  res.status(201).json({ message: "Review added", insertedId: result.insertedId });
              } catch (err) {
                  console.error("❌ Error adding review:", err);
                  res.status(500).json({ error: 'Failed to add review' });
              }
          });

          // GET Reviews (Public)
          app.get('/courses/:id/reviews', checkDbConnection, async (req, res) => {
              const courseIdParam = req.params.id;
              if (!ObjectId.isValid(courseIdParam)) return res.status(400).json({ error: 'Invalid ID' });
              const courseObjectId = new ObjectId(courseIdParam);
             try {
                  const reviews = await reviewsCollection.find({ courseObjectId: courseObjectId })
                                      .sort({ createdAt: -1 }).toArray();
                  res.json(reviews);
              } catch (err) {
                  console.error("❌ Error fetching reviews:", err);
                  res.status(500).json({ error: 'Failed to fetch reviews' });
              }
          });

        // --- Instructor Analytics ---
        app.get('/instructor/courses/:id/analytics', verifyJWT, checkDbConnection, getUserRole, verifyInstructor, async (req, res) => {
             const { id } = req.params;
             const requestingUserEmail = req.decoded.email;
             if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ID' });
             const courseObjectId = new ObjectId(id);
             try {
                 const course = await coursesCollection.findOne({ _id: courseObjectId });
                 if (!course) return res.status(404).json({ error: 'Course not found' });
                 if (req.userRole === 'instructor' && course.instructorEmail !== requestingUserEmail) {
                     return res.status(403).json({ error: 'Forbidden: Not your course' });
                 }
                 const totalEnrollments = await enrollmentsCollection.countDocuments({ courseId: id });
                 const enrolledStudents = await enrollmentsCollection
                     .find({ courseId: id }).project({ userEmail: 1, enrolledAt: 1 })
                     .sort({ enrolledAt: -1 }).toArray();
                 const ratingPipeline = [
                     { $match: { courseObjectId: courseObjectId } },
                     { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } }
                 ];
                 const ratingResult = await reviewsCollection.aggregate(ratingPipeline).toArray();
                 const analyticsData = {
                     courseTitle: course.courseTitle, totalEnrollments: totalEnrollments,
                     enrolledStudents: enrolledStudents,
                     averageRating: ratingResult[0]?.avgRating || 0,
                     reviewCount: ratingResult[0]?.count || 0,
                 };
                 res.json(analyticsData);
             } catch(err) {
                 console.error("❌ Error fetching analytics:", err);
                 res.status(500).json({ error: 'Analytics fetch failed' });
             }
         });

        // --- Popular Courses (Public) ---
        // (FIXED) Apply the same logic as /courses to show 'approved' or no-status courses
        app.get('/popular-courses', checkDbConnection, async (req, res) => {
              try {
                   const pipeline = [
                       // --- This is complex, let's simplify by matching on courses first ---
                       // 1. Find approved/no-status courses
                       { $match: { 
                           $or: [
                               { status: 'approved' },
                               { status: { $exists: false } }
                           ]
                       }},
                       // 2. Sort by enrollmentCount
                       { $sort: { enrollmentCount: -1 } },
                       // 3. Limit to top 6
                       { $limit: 6 },
                       // 4. Project needed fields
                       { $project: {
                           _id: 1,
                           courseTitle: 1,
                           imageURL: "$image", // Use the 'image' field from your DB
                           enrollCount: "$enrollmentCount" // Use the count from the doc
                       }}
                   ];
                   // (FIXED) Query coursesCollection directly instead of enrollment aggregation
                   const popular = await coursesCollection.aggregate(pipeline).toArray();
                   res.json(popular);
               } catch (err) {
                   console.error('❌ Error fetching popular courses:', err);
                   res.status(500).json({ error: 'Failed to fetch popular courses' });
               }
          });

        // --- Root Route ---
        app.get('/', (req, res) => {
              res.send('✅ CourseHub Server is Running!');
          });

        // --- 404 Handler (Keep AFTER all other routes) ---
        app.use((req, res) => {
            res.status(404).send({ error: true, message: `API Route not found: ${req.originalUrl}` });
        });

    } catch (err) {
        console.error("❌ CRITICAL: Failed to connect to MongoDB or setup initial routes:", err);
        isDbConnected = false;
        app.use((req, res) => {
            res.status(503).send({ error: true, message: "Database connection failed. Server cannot serve requests." });
        });
    }
}

// Start the server initialization and listen
run().then(() => {
    if (isDbConnected) {
        app.listen(port, () => {
            console.log(`🚀 Server running at http://localhost:${port}`);
        });
    } else {
         console.error("❌ Server did not start because DB connection failed during run().");
         const errorApp = express();
         errorApp.use((req, res) => {
             res.status(503).send({ error: true, message: "Server failed to start due to database issues." });
         });
         errorApp.listen(port, () => {
             console.log(`⚠️ Server started in ERROR MODE on port ${port} due to DB connection failure.`);
         });
    }
}).catch(err => {
    console.error("❌ Server failed to start:", err);
    process.exit(1);
});

// --- Graceful Shutdown ---
const cleanup = async () => {
    console.log("🔌 Shutting down server...");
    try {
        if (client && isDbConnected) {
            // await client.close(); // Commented out as requested
        }
    } catch (closeErr) {
        console.error("Error closing MongoDB connection:", closeErr);
    } finally {
        process.exit(0);
    }
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

