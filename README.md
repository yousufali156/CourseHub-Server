# 🖥️ CourseHub – Server

This is the **server-side** of the Course Management System web application. It handles user authentication, course CRUD operations, and enrollment management using Node.js, Express, and MongoDB.

---

## 🔗 Live Server URL

> 🌐 https://your-server-domain.vercel.app (replace this with your actual server live link)

---

## 🚀 Features

- ✅ **JWT Authentication (Access + Secure Cookies)**
- 🧑‍🏫 **Add / Update / Delete Courses (Private API)**
- 🎫 **Course Enrollment with Seat Limitations**
- 🔒 **Protected Routes via JWT Middleware**
- 📃 **RESTful API Design**
- 🧹 **Error Handling & CORS Setup**

---

## 📁 API Endpoints

### 🔐 Auth Routes

| Method | Route              | Description                  |
|--------|-------------------|------------------------------|
| POST   | `/jwt`             | Create and send JWT token    |
| GET    | `/logout`          | Clears the token cookie      |

### 📚 Courses

| Method | Route                | Description                          |
|--------|---------------------|--------------------------------------|
| GET    | `/courses`           | Get all courses                      |
| POST   | `/courses`           | Add a new course (Private)           |
| GET    | `/courses/:id`       | Get single course by ID              |
| PUT    | `/courses/:id`       | Update a course (Private)            |
| DELETE | `/courses/:id`       | Delete a course (Private)            |
| GET    | `/courses/user/:email` | Get all courses added by a user     |
| GET    | `/courses/popular`   | Get top enrolled courses             |

### 🧾 Enrollments

| Method | Route                 | Description                          |
|--------|----------------------|--------------------------------------|
| POST   | `/enroll`             | Enroll in a course (with validation) |
| GET    | `/enroll/:email`      | Get enrolled courses of a user       |
| DELETE | `/enroll/:email/:id`  | Remove enrollment from a course      |

---

## 🔧 Technologies Used

- **Node.js**
- **Express.js**
- **MongoDB (with Mongoose / native)**
- **CORS**
- **dotenv**
- **jsonwebtoken**
- **cookie-parser**

---

## 🔐 Environment Variables

