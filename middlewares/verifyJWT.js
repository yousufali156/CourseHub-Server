// middlewares/verifyJWT.js
import jwt from 'jsonwebtoken';

const verifyJWT = (req, res, next) => {
  const token = req.cookies?.token; // ✅ Token from cookie

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized: No token in cookie' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'Forbidden: Invalid token' });
    }

    req.decoded = decoded; // decoded contains email, uid etc.
    next();
  });
};

export default verifyJWT;

