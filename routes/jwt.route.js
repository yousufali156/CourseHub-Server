//routes/jwt.route.js

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

router.post('/jwt', (req, res) => {
  const user = req.body;
  if (!user?.email) {
    return res.status(400).send({ error: true, message: 'Missing user email' });
  }

  const token = jwt.sign(user, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });

  res.send({ token });
});

module.exports = router;
