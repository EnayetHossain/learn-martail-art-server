const express = require("express");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

const verifyJWT = (req, res, next)=>{
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error: true, message: "Unauthorized! access denied"});
  }

  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
    if(err){
      return res.status(401).send({error: true, message: "Unauthorized! access denied"});
    }
    req.decoded = decoded;
    next();
  });
}

function flattenArray(nestedArray) {
  var flattenedArray = [];

  for (var i = 0; i < nestedArray.length; i++) {
    if (Array.isArray(nestedArray[i])) {
      flattenedArray = flattenedArray.concat(flattenArray(nestedArray[i]));
    } else {
      flattenedArray.push(nestedArray[i]);
    }
  }

  return flattenedArray;
}


// mongo db authentication
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vahgs6d.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    const classCollection = client.db("martialDB").collection("classes");
    const usersCollection = client.db("martialDB").collection("users");
    const selectedClassCollection = client.db("martialDB").collection("selectedClass");
    const paymentCollection = client.db("martialDB").collection("payment");

    app.post("/jwt", (req, res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "1h"});
      res.send({token});
    });

    const verifyAdmin = async (req, res, next)=>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      if(user?.role !== "admin"){
        return res.status(403).send({error: true, message: "Forbidden! access denied"});
      }
      next()
    }

    const verifyInstructor = async(req, res, next)=>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      if(user?.role !== "instructor"){
        return res.status(403).send({error: true, message: "Forbidden! access denied"});
      }
      next()
    }

    const verifyStudent = async(req, res, next)=>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      if(user?.role !== "student"){
        return res.status(403).send({error: true, message: "Forbidden! access denied"});
      }
      next()
    }

    // get the classes
    app.get("/classes", async(req, res)=>{
        const limit = parseInt(req.query.limit);
        const query = {status: "approved"}
        const options = {
            sort: {"students": -1}
        }
        const result = await classCollection.find(query, options).limit(limit).toArray();
        res.send(result);
    });

    app.get("/my-classes", verifyJWT, verifyInstructor, async(req, res)=>{
      const email = req.query.email;
      const query = {Instructor_email: email};
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/my-classes/:id", verifyJWT, verifyInstructor, async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    app.patch("/my-classes/:id", verifyJWT, verifyInstructor, async(req, res)=>{
      const id = req.params.id;
      const updateClass = req.body;

      const query = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          class_name: updateClass.class_name,
          picture: updateClass.picture,
          seats: updateClass.seats,
          price: updateClass.price
        }
      }

      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    })

    app.post("/classes", verifyJWT, verifyInstructor, async(req, res)=>{
      const userClass = req.body;
      const result = await classCollection.insertOne(userClass);
      res.send(result);
    });

    app.get("/users", verifyJWT, verifyAdmin, async(req, res)=>{
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/role/:email", verifyJWT, async(req, res)=>{
      const email = req.params.email;
      if(req.decoded.email !== email){
        res.send({role: null})
      }
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      const result = {role: user?.role}
      res.send(result);
    });

    app.post("/users", async(req, res)=>{
      const user = req.body;
      const query = {email: user.email};
      const userExists = await usersCollection.findOne(query);
      if(userExists){
        return res.send({message: "user already exists"});
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/:id", verifyJWT, async(req, res)=>{
      const id = req.params.id;
      const role = req.query.role;
      const query = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          role: role
        }
      }

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get("/pending-classes", verifyJWT, verifyAdmin, async(req, res)=>{
      const query = {status: "pending"};
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.patch("/pending-classes/:id", verifyJWT, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const status = req.query.status;
      const query = {_id: new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: status,
        }
      }
      
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result)
    });

    app.patch("/feedback/:id", verifyJWT, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const feedback = req.body;

      const query = {_id: new ObjectId(id)}
      const updateDoc = {
        $set: {
          feedback: feedback.feedback
        }
      }

      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    })

    app.get("/instructors", async(req, res)=>{
      const limit = parseInt(req.query.limit);
      const query = {role: "instructor"}
      const result = await usersCollection.find(query).limit(limit).toArray();
      res.send(result);
    });

    // student selected classes
    app.post("/selectedClass", verifyJWT, async(req, res)=>{
      const selectedClass = req.body;
      const result = await selectedClassCollection.insertOne(selectedClass);
      res.send(result);
    })

    app.get("/selectedClass", verifyJWT, async(req, res)=>{
      const userEmail = req.query.email;
      const decodedEmail = req.decoded.email;

      if(userEmail !== decodedEmail){
        return res.status(403).send({error: true, message: "Forbidden! access denied"})
      }

      const query = {studentEmail: userEmail};
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result);
    })

    app.delete("/selectedClass/:id", verifyJWT, async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result);
    });

    // PAYMENT API
    app.post("/create-payment-intent", verifyJWT, verifyStudent, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
    
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card'],
      });
    
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments", verifyJWT, verifyStudent, async(req, res)=>{
      const email = req.query.email;
      const query = {email: email};
      const result = await paymentCollection.find(query).toArray();
      const ids = result.map(resl=> resl.classIds);

      const classIds = flattenArray(ids);

      const filter = {_id: {$in: classIds.map(id => new ObjectId(id))}};
      const enrolledClassesResult = await classCollection.find(filter).toArray();
      res.send(enrolledClassesResult);
    });

    app.get("/payment-history", verifyJWT, verifyStudent, async(req, res)=>{
      const email = req.query.email;
      const query = {email: email};
      const options = {
        sort: {"date": -1}
      }
      const result = await paymentCollection.find(query, options).toArray();
      res.send(result);
    })

    app.patch("/payments", verifyJWT, verifyStudent, async(req, res)=>{
      const ids = req.body;
      const query = {_id: {$in: ids.map(id=> new ObjectId(id))}};
      const updateDoc = {
        $inc: {
          students: 1
        }
      }
      const result = await classCollection.updateMany(query, updateDoc);
      res.send(result);
    })

    app.post("/payments", verifyJWT, verifyStudent, async(req, res)=>{
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {_id: {$in: payment.selectedClassIds.map(id=> new ObjectId(id))}};
      const deleteResult = await selectedClassCollection.deleteMany(query);
      res.send({insertResult, deleteResult});
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


// api
app.get("/", (req, res)=>{
    res.send("server running");
});

app.listen(port, ()=>{
    console.log(`visit http://localhost:${port}`);
})