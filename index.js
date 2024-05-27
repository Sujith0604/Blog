import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "./models/UserModal.js";
import cookieParser from "cookie-parser";
import multer from "multer";
import fs from "fs";
import Post from "./models/Post.js";
import path from "path";
import dotenv from "dotenv";

dotenv.config();
const __dirname = path.resolve();

const uploadMiddleware = multer({ dest: "uploads/" });

const corsOptions = {
  origin: "http://localhost:5173",
  credentials: true, //access-control-allow-credentials:true
  optionSuccessStatus: 200,
};

const app = express();
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(
  bodyParser.urlencoded({
    limit: "50mb",
    extended: true,
    parameterLimit: 50000,
  })
);
app.use(cookieParser());
app.use("/uploads", express.static(__dirname + "/uploads"));

const saltRound = process.env.SALT;
const secretKey = process.env.SECRET_KEY;
mongoose.connect(process.env.MONGODB_CNNECTION).then(() => {
  console.log("Connected to database");
});

app.post("/register", async (req, res) => {
  console.log(req.body);
  const { email, password, username } = req.body;

  const user = await User.findOne({ email });

  if (user) {
    return res.status(409).json({ message: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, saltRound);
  try {
    const newUser = await User.create({
      username: username,
      email: email,
      password: hashedPassword,
    });
    res.status(201).json(newUser);
  } catch (error) {
    res.status(409).json({ message: "User cannot be created" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  const correctPassword = await bcrypt.compare(password, user.password);
  if (correctPassword) {
    jwt.sign({ user, id: user._id }, secretKey, {}, (err, token) => {
      if (err) throw err;
      res.cookie("token", token).json({
        id: user._id,
        user,
      });
    });
  }
});

app.get("/profile", async (req, res) => {
  const { token } = req.cookies;
  await jwt.verify(token, secretKey, {}, (err, info) => {
    if (err) {
      throw err;
    }
    res.json(info);
  });
});

app.post("/logout", async (req, res) => {
  res.cookie("token", "").json("ok");
});

app.post("/createpost", uploadMiddleware.single("file"), async (req, res) => {
  const { originalname, path } = req.file;
  const parts = originalname.split(".");
  const ext = parts[parts.length - 1];
  const newPath = path + "." + ext;
  fs.renameSync(path, newPath);

  const { token } = req.cookies;

  jwt.verify(token, secretKey, {}, async (err, info) => {
    if (err) throw err;
    const { title, summary, content } = req.body;

    const newPost = await Post.create({
      title: title,
      summary: summary,
      content: content,
      cover: newPath,
      author: info.id,
    });
    res.status(201).json(newPost);
  });
});

app.get("/createpost", async (req, res) => {
  const posts = await Post.find()
    .populate("author", ["username"])
    .sort({ createdAt: -1 })
    .limit(20);
  res.json(posts);
});

app.delete("/createpost/:id", async (req, res) => {
  const { id } = req.params;
  await Post.findByIdAndDelete(id);
  res.status(204).json({
    status: "success",
    data: null,
  });
});

app.get("/singlepost/:id", async (req, res) => {
  const { id } = req.params;

  const post = await Post.findById(id).populate("author", ["username"]);
  res.json(post);
});

app.patch("/createpost", uploadMiddleware.single("file"), async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    newPath = path + "." + ext;
    fs.renameSync(path, newPath);
  }

  const { token } = req.cookies;

  jwt.verify(token, secretKey, {}, async (err, info) => {
    if (err) throw err;

    const { id, title, summary, content } = req.body;
    const post = await Post.findById(id);
    const isAuthor = JSON.stringify(post.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json("You are not teh author");
    }

    const updatedPost = await Post.updateMany({
      title,
      summary,
      content,
      cover: newPath ? newPath : post.cover,
    });
    res.status(200).json(updatedPost);
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serving on port ${port}`);
});
