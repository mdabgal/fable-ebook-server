const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// test route
app.get("/", (req, res) => {
  res.send("Fable Ebook Server Running...");
});

// mongo uri
const uri = process.env.MONGO_DB_URI;

// client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// collections
let db;
let ebooksCollection;
let usersCollection; 

// connect db
async function run() {
  try {
    await client.connect();

    db = client.db(process.env.AUTH_DB_NAME);
    ebooksCollection = db.collection("ebooks");
    usersCollection = db.collection("users"); 

    console.log("MongoDB Connected Successfully");
    console.log("DB Name:", db.databaseName);

    await client.db("admin").command({ ping: 1 });
  } catch (error) {
    console.log("DB Error:", error);
  }
}

run();


// ============================
// 📚 EBOOK APIs (CRUD)
// ============================

// 1. GET FEATURED EBOOKS (লেটেস্ট ৬টি বই দেখানোর জন্য)
app.get("/ebooks/featured", async (req, res) => {
  try {
    const result = await ebooksCollection
      .find()
      .sort({ createdAt: -1 }) 
      .limit(6)
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to get featured ebooks" });
  }
});


// 2. GET ALL EBOOKS
app.get("/ebooks", async (req, res) => {
  try {
    const result = await ebooksCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to get ebooks" });
  }
});


// 3. GET SINGLE EBOOK
app.get("/ebooks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await ebooksCollection.findOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to get ebook" });
  }
});


// 4. ADD EBOOK (Writer Option)
app.post("/ebooks", async (req, res) => {
  try {
    const data = req.body;

    const result = await ebooksCollection.insertOne({
      ...data,
      createdAt: new Date(),
      status: "published", // ডিফল্টভাবে পাবলিশড থাকবে
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to add ebook" });
  }
});


// 5. UPDATE EBOOK (Writer/Admin Edit Option - নতুন যুক্ত করা হয়েছে)
app.put("/ebooks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    
    // _id ফিল্ডটি বডি থেকে ডিলিট করে নেওয়া নিরাপদ যেন মঙ্গোডিবি এরর না দেয়
    delete updatedData._id;

    const result = await ebooksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    if (result.modifiedCount === 1 || result.matchedCount === 1) {
      res.send({ success: true, message: "Ebook updated successfully" });
    } else {
      res.status(404).send({ error: "Ebook not found or no changes made" });
    }
  } catch (error) {
    res.status(500).send({ error: "Failed to update ebook" });
  }
});


// 6. TOGGLE PUBLISH/UNPUBLISH STATUS (নতুন যুক্ত করা হয়েছে)
// app.patch("/ebooks/:id/status", async (req, res) => {
//   try {
//     const id = req.params.id;
//     const { status } = req.body; // ফ্রন্টএন্ড থেকে "published" অথবা "unpublished" আসবে

//     const result = await ebooksCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { status: status } }
//     );

//     res.send(result);
//   } catch (error) {
//     res.status(500).send({ error: "Failed to update status" });
//   }
// });
// 🔄 ইবুক পাবলিশ/আনপাবলিশ স্ট্যাটাস আপডেট API (PATCH)
app.patch("/ebooks/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body; 

    const filter = { _Id: new ObjectId(id) }; 
    const updateDoc = {
      $set: {
        status: status,
      },
    };

    const result = await ebooksCollection.updateOne(filter, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({ success: true, message: `Ebook status updated to ${status}` });
    } else {
      res.status(404).send({ error: "Ebook not found or no changes made" });
    }
  } catch (error) {
    res.status(500).send({ error: "Failed to update status" });
  }
});

// 7. DELETE AN EBOOK (Writer/Admin Option)
app.delete("/ebooks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await ebooksCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 1) {
      res.send({ success: true, message: "Ebook deleted successfully" });
    } else {
      res.status(404).send({ error: "Ebook not found" });
    }
  } catch (error) {
    res.status(500).send({ error: "Failed to delete ebook" });
  }
});


// ============================
// 👥 USER MANAGEMENT APIs
// ============================

// GET ALL USERS (Admin dashboard এর জন্য)
app.get("/users", async (req, res) => {
  try {
    const result = await usersCollection.find().toArray();
    console.log("Users Count:", result.length);
    res.send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Failed to fetch users" });
  }
});


// UPDATE USER ROLE (Admin manage users এর জন্য - নতুন যুক্ত করা হয়েছে)
app.patch("/users/:id/role", async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body; // ফ্রন্টএন্ড থেকে "reader", "writer", অথবা "admin" আসবে

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: role } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to update user role" });
  }
});


// start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});