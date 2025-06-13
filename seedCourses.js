// seedCourses.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');

const courses = JSON.parse(fs.readFileSync('./courses.json', 'utf8'));

const uri = `mongodb+srv://${process.env.MDB_USER}:${process.env.MDB_PASS}@cluster0.mr3w9gn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

async function insertCourses() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('coursehub_db');
    const collection = db.collection('courses');
    const result = await collection.insertMany(courses);
    console.log(`✅ Inserted ${result.insertedCount} courses`);
  } finally {
    await client.close();
  }
}

insertCourses();
