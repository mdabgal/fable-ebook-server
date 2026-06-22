const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { jwtVerify, createRemoteJWKSet } = require("jose-cjs");

const app = express();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());

// test route
app.get("/", (req, res) => {
  res.send("Fable Ebook Server Running...");
});


const uri = process.env.MONGO_DB_URI;

// client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});




const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  // ["Bearer", "xjasasdhsagdydsav"]

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ msg: "Unauthorized" });
  }
};







let db;
let ebooksCollection;
let usersCollection; 
let purchasesCollection;
let sessionCollection;

db = client.db(process.env.AUTH_DB_NAME);
ebooksCollection = db.collection("ebooks");
usersCollection = db.collection("user"); 
purchasesCollection = db.collection("purchases");

sessionCollection = db.collection('session');

console.log("MongoDB Connected Successfully");
console.log("DB Name:", db.databaseName);
const verifySessionToken = async (req, res, next) => {

            const authHeader = req.headers?.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const token = authHeader.split(' ')[1]

            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const query = { token: token }
            const session = await sessionCollection.findOne(query);

              if (!session) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const userId = session.userId;


            const userQuery = {
                _id: userId
            }

            const user = await usersCollection.findOne(userQuery);
              if (!user) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            // set data in the req object
            req.user = user;
            next();
        }

// const jwt = require("jsonwebtoken");

// const verifyToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     return res.status(401).send({ message: "Unauthorized" });
//   }

//   const token = authHeader.split(" ")[1];

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded;
//     next();
//   } catch (error) {
//     return res.status(401).send({ message: "Invalid token" });
//   }
// };






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



app.patch("/users/verify-writer", async (req, res) => {
  const { email } = req.body;

  await usersCollection.updateOne(
    { email },
    {
      $set: {
        role: "writer",
        writerVerified: true
      }
    }
  );

  res.send({ success: true });
});


app.get("/ebooks", async (req, res) => {
  try {
    const { search, genre, minPrice, maxPrice, availability, sortBy, page = 1, limit = 6 } = req.query;

    let query = {};

  
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } }
      ];
    }

    if (genre) {
      query.genre = genre;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (availability) {
      query.availability = availability;
    }

    let sortObj = {};
    if (sortBy === "newest") {
      sortObj._id = -1; 
    } else if (sortBy === "priceLowHigh") {
      sortObj.price = 1;
    } else if (sortBy === "priceHighLow") {
      sortObj.price = -1;
    } else {
      sortObj._id = -1;
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const totalBooks = await ebooksCollection.countDocuments(query);
    const books = await ebooksCollection
      .find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    res.send({
      books,
      totalBooks,
      totalPages: Math.ceil(totalBooks / limitNum),
      currentPage: pageNum
    });
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch ebooks" });
  }
});




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



app.post("/ebooks", async (req, res) => {
  try {
    const data = req.body;

    const result = await ebooksCollection.insertOne({
      ...data,
      createdAt: new Date(),
      status: "published", 
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to add ebook" });
  }
});



app.put("/ebooks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    
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



app.patch("/ebooks/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body; 

    const filter = { _id: new ObjectId(id) }; 
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



// app.get("/writer/sales-history", async (req, res) => {
//   try {
//     const { email } = req.query;

//     const sales = await purchasesCollection.aggregate([
//       { $match: { writerEmail: email } },

//       {
//         $addFields: {
//           bookObjectId: { $toObjectId: "$bookId" }
//         }
//       },

//       {
//         $lookup: {
//           from: "ebooks",
//           localField: "bookObjectId",
//           foreignField: "_id",
//           as: "ebook",
//         },
//       },

//       { $unwind: "$ebook" },

//       {
//         $project: {
//           _id: 1,
//           readerEmail: "$userEmail",
//           ebookTitle: "$ebook.title",
//           genre: "$ebook.genre",
//           price: "$amount",
//           date: 1,
//         },
//       },

//       { $sort: { date: -1 } },
//     ]).toArray();

//     res.send(sales);
//   } catch (err) {
//     console.log(err);
//     res.status(500).send({ error: "Failed to fetch sales history" });
//   }
// });

app.get("/writer/sales-history", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).send({ error: "Email required" });
    }
    console.log(email)

    const sales = await purchasesCollection.aggregate([
      {
        $match: { writerEmail: email }
      },
      {
        $lookup: {
          from: "ebooks",
          localField: "bookId",
          foreignField: "_id",
          as: "ebook"
        }
      },
      {
        $unwind: {
          path: "$ebook",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          readerEmail: "$userEmail",
          ebookTitle: "$ebook.title",
          price: "$amount",
          date: 1
        }
      },
      {
        $sort: { date: -1 }
      }
    ]).toArray();

    res.send(sales);
  } catch (err) {
    console.log(err);
    res.status(500).send({ error: "Failed to fetch sales history" });
  }
});


app.get("/writer/books", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).send({ error: "Writer email is required" });
    }
    
  
    const query = { writerEmail: email }; 
    const result = await ebooksCollection.find(query).toArray();
    
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch writer's books" });
  }
});





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


// app.patch("/users/:id/role", async (req, res) => {
//   try {
//     const id = req.params.id;
//     const { role } = req.body; 

//     const result = await usersCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { role: role } }
//     );

//     res.send(result);
//   } catch (error) {
//     res.status(500).send({ error: "Failed to update user role" });
//   }
// });



// admin

app.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const result = await usersCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      error: "Failed to delete user",
    });
  }
});


app.get("/admin/ebooks", async (req, res) => {
  try {
    const ebooks = await ebooksCollection.find().toArray();
    res.send(ebooks);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch ebooks" });
  }
});


// app.patch("/ebooks/:id/status", async (req, res) => {
//   try {
//     const id = req.params.id;
//     const { status } = req.body;

//     const result = await ebooksCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { status } }
//     );

//     res.send(result);
//   } catch (error) {
//     res.status(500).send({ error: "Failed to update status" });
//   }
// });



app.get("/admin/transactions", async (req, res) => {
  try {
    const transactions = await purchasesCollection
      .find()
      .sort({ date: -1 })
      .toArray();

    res.send(transactions);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch transactions" });
  }
});




app.post("/purchase", verifySessionToken,  async (req, res) => {
  try {
    const { writerEmail, amount, bookId } = req.body;
console.log("PURCHASE HIT:", req.body);
console.log("USER:", req.user);
    const result = await purchasesCollection.insertOne({
      transactionId: new ObjectId().toString(),
      type: "purchase",
       userEmail: req.body.userEmail,
      writerEmail,
      amount,
      bookId,
      date: new Date(),
    });
console.log(result,'result')
    res.send(result);
  } catch (error) {
    console.log(error)
    res.status(500).send({ error: "Purchase failed" });
  }
});






app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});



 


