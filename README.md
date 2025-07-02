🖥️ CourseHub – Server
This is the server-side of the CourseHub course management system. It manages authentication, course CRUD operations, enrollments, and secure API routing using Node.js, Express, and MongoDB.

🔗 Live Server URL
🌐 https://your-server-domain.vercel.app

🚀 Features
✅ JWT Authentication (Access Tokens + Secure Cookies)

🔒 Protected Routes with Middleware

🧑‍🏫 Course Management (Add / Update / Delete)

🎫 Course Enrollment with Seat Validation

📃 RESTful API Design

🧹 Global Error Handling & CORS Setup

📁 Folder Structure
bash
Copy
Edit
/server
├── /routes        # All Express route handlers (auth, courses, enrollments) <br/>
├── /controllers   # Route controller logic <br/>
├── /middlewares   # JWT auth, error handling, role protection <br/>
├── /models        # MongoDB schemas <br/>
├── /utils         # Helper functions (e.g., token creation) <br/>
├── .env           # Environment variables <br/>
├── server.js      # Main Express app <br/>
└── package.json <br/>


🔐 Auth Routes
Method	Route	Description
POST	/jwt: Generate JWT and set cookie
GET	/logout	Clear token cookie

📚 Course Routes
Method	Route	Description
GET	/courses	Get all courses
POST	/courses	Add a new course (Private)
GET	/courses/:id	Get a single course by ID
PUT	/courses/:id	Update a course (Private)
DELETE	/courses/:id	Delete a course (Private)
GET	/courses/user/:email	Get all courses added by a user
GET	/courses/popular	Get top-enrolled courses

🧾 Enrollment Routes
Method	Route	Description
POST	/enroll	Enroll in a course (with validation)
GET	/: enroll/:email	Get enrolled courses of a user
DELETE	/: enroll/:email/:id	Remove enrollment from a course

🔧 Technologies Used
Node.js

Express.js

MongoDB (with Mongoose or native driver)

CORS

dotenv

jsonwebtoken

cookie-parser

🔐 Environment Variables
You must define the following in your .env file:

env
Copy
Edit
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
📌 Deployment
Backend Hosting: Vercel or Render

Please make sure environment variables are set properly in deployment platform settings.

💰 Support Me
<p align="center"> <a href="https://www.buymeacoffee.com/yousufali156" target="_blank"> <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" style="border-radius:12px" /> </a> </p>
