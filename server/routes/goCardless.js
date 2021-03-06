const express=require('express')
const mongoose=require('mongoose')
const router=new express.Router()
const gocardless = require('gocardless-nodejs');
const constants = require('gocardless-nodejs/constants');
const User=require('../models/user')
const Product=require('../models/product')
const Subscription=require('../models/subscription')
const auth=require('../auth/auth')


//api docs link
//https://developer.gocardless.com/getting-started/api/making-your-first-request/

//errors and more functions provided by the api 
//https://developer.gocardless.com/api-reference/#invalid_filters



//(i)
//first go to sandbox and create your account .
//click on create access token and give token a name and give read and write access
//create gocardless access token  (e:g)  
//sandbox_iGI0R5ZlRf9fLMc-iRnJ8eVkolJd-1YqRwqqN0Yp
const sessionToken='testToken'  //your application generated token 
const GoCardlessAccessToken='sandbox_BwJaf2ZKRqqv0ahj1htg_txHg01Dn1_F9FdEsxx2' //generated by gocardless for you application using your account.
const client = gocardless(
    // We recommend storing your access token in an environment
    // variable for security like given below
    //process.env.GoCardlessAccessToken,
    //but for now we are storing in a variable for testing
    GoCardlessAccessToken,
    // Change this to constants.Environments.Live when you're ready to go live
    constants.Environments.Sandbox
);

//(ii) making a request

router.get('/',auth,async(req,res)=>{
  try {
    var status="no"
    var subscription="no"
    const userID=req.userID
    const user=await User.findById({_id:mongoose.Types.ObjectId(userID)})
    status=user.gocardlessStatus
    subscription=user.gocardlessSubscription
    
    if(subscription == "undefined"){
      subscription="no"
    }

    const products = await Product.find()
    if(status == "yes"){
        console.log('1')
        if(subscription != "no"){
          console.log('2')
          return res.render('dashboard/dashboard',{
            products:products,
            status:status,
            subscription:subscription
          })
        } 
        console.log('3')
        return res.render('dashboard/dashboard',{
          products:products,
          status:status
        })
    }else{
      console.log('4')
        return res.render('dashboard/dashboard',{
          products:products
        })
    }

    
  } catch (e) {
    console.log(e)
  }
})


router.post('/addProduct',async(req,res)=>{
  try {
    const product =new Product(req.body)
    await product.save()
    res.redirect('/')
  } catch (e) {
    console.log(e)
  }
})


router.get('/gocardlessCreateUser',auth,async(req,res)=>{
    try {
      const userID=req.userID
        const user=await User.findById({_id:mongoose.Types.ObjectId(userID)})
        const redirectFlow = await client.redirectFlows.create({
            description: "Cider Barrels",
            session_token: sessionToken,
            success_redirect_url:
              "http://localhost:3000/successPage", 
            prefilled_customer: {
              given_name: user.name,
              family_name: user.name,
              email: user.email,
              address_line1: "338-346 Goswell Road",
              city: "London",
              postal_code: "EC1V 7LQ"
            }
          });
          
          
          console.log(redirectFlow.id);
          console.log(redirectFlow.redirect_url);

          res.redirect(redirectFlow.redirect_url)
    } catch (e) {
        console.log(e)
    }
})


router.get('/successPage',(req,res)=>{
  res.render('dashboard/goCardlessSuccess')
})




router.get('/gocardlessCompleteMandate/:id',auth,async(req,res)=>{
    const redirectFlowID=req.params.id
    try {
        const userID=req.userID
        const redirectFlow = await client.redirectFlows.complete(
          redirectFlowID, //this is redirectFlow.id and in query parameter also we get in redirectFlow in above route.
            {
              session_token: sessionToken
            }
          );
          
          // Store the mandate and customer against the customer's database record so you can charge
          // them in future
          console.log(`Mandate: ${redirectFlow.links.mandate}`); //save in db with Customer id
          console.log(`Customer: ${redirectFlow.links.customer}`);
          console.log(`Confirmation URL: ${redirectFlow.confirmation_url}`);
          
          // Display a confirmation page to the customer, telling them their Direct Debit has been
          // set up. You could build your own, or use ours, which shows all the relevant
          // information and is translated into all the languages we support.

          const user=await User.findById({_id:mongoose.Types.ObjectId(userID)})
          user.gocardlessCustomerID=redirectFlow.links.customer
          user.gocardlessMandateID=redirectFlow.links.mandate
          user.gocardlessStatus="yes"
          await user.save()

          res.redirect('/')
    } catch (e) {
        console.log(e.message)
    }
})


//(iv) taking payment from customer
router.get('/gocardlessPayment/:id',auth,async(req,res)=>{
    const productID=req.params.id
    try {
      const userID=req.userID
      const user=await User.findById({_id:mongoose.Types.ObjectId(userID)})
      const product=await Product.findById({_id:mongoose.Types.ObjectId(productID)})
      var am=product.price + "00"
      var mandateID=user.gocardlessMandateID

      const random_payment_specific_string=generateRandomStr(5)
        const payment = await client.payments.create(
            {
              amount: am,
              currency: "GBP",  // UK currency
              links: {
                mandate: mandateID  // get from database  
              },
              metadata: {
                invoice_number: "10" // generate according to your invoices in your database
              }
            },
            random_payment_specific_string // a string should be unique for every payment
          );

         
          
          // Keep hold of this payment ID - we'll use it in a minute
          // It should look like "PM000260X9VKF4"
          console.log(payment.id);
          let obj={
            paymentID:payment.id,
            productID:productID
          }
          user.gocardlessPayments.push(obj)
          await user.save()
          res.redirect('/successfullPayment')
    } catch (e) {
        console.log(e)
    }
})

//to generate a random string

function generateRandomStr(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}


router.get('/successfullPayment',(req,res)=>{
  res.render('dashboard/successPayment')
})

router.get('/myProducts',auth,async(req,res)=>{
  
  const userID=req.userID
  const user=await User.findById({_id:mongoose.Types.ObjectId(userID)}).populate({
    path:'gocardlessPayments',
    populate:{path:'productID'}
  })

  var arr=[]
  if(user.gocardlessPayments){
    var temp=user.gocardlessPayments
    for (const i of temp) {
      let temp2=i.productID
      let obj={
        paymentID:i.paymentID,
        name:temp2.name,
        price:temp2.price
      }
      arr.push(obj)
    }
  }
 
  

  res.render('dashboard/myProduct',{
    user:user,
    products:arr
  })
})


router.get('/gocardlessPaymentDetails/:id',async(req,res)=>{
    const paymentId=req.params.id
    try {
        const paymentDetails = await client.payments.find(paymentId);

        console.log(`Amount: ${paymentDetails.amount}`);
        console.log(`Status: ${paymentDetails.status}`);

        res.render('dashboard/paymentDetails',{
          paymentID:paymentId,
          amount:paymentDetails.amount,
          status: paymentDetails.status
        })
    } catch (e) {
        console.log(e)
    }
})

router.get('/gocardlessCancelPayment/:id',async(req,res)=>{
  const paymentId=req.params.id
  try {
    const paymentDetails = await client.payments.find(paymentId);
    if(paymentDetails.status == "cancelled"){
      return res.render('dashboard/paymentDetails',{
        paymentID:paymentId,
        amount:paymentDetails.amount,
        status: paymentDetails.status
      })
    }
      console.log("Cancelling...");

      const cancelPayment = await client.payments.cancel(paymentId);
      const paymentDetails2 = await client.payments.find(paymentId);
      return res.render('dashboard/paymentDetails',{
        paymentID:paymentId,
        amount:paymentDetails2.amount,
        status: paymentDetails2.status
      })
  } catch (e) {
      console.log(e)
  }
})





router.get('/subscription',auth,async(req,res)=>{
  const sub= await Subscription.find()
  res.render('dashboard/subscription',{
    subscription:sub
  })
})


router.post('/createSubscription',async(req,res)=>{
  try {
    const sub=new Subscription(req.body)
    await sub.save()
    res.send(sub)
  } catch (e) {
    console.log(e)
  }
})



router.get('/gocardlessSubscription/:id',auth,async(req,res)=>{
    const subscriptionID=req.params.id
    try {
      const userID=req.userID
      const user=await User.findById({_id:mongoose.Types.ObjectId(userID)})
      
      const mandateID=user.gocardlessMandateID
      const sub=await Subscription.findById({_id:mongoose.Types.ObjectId(subscriptionID)})


      var random_subscription_specific_string="subscription_"+generateRandomStr(5)
        const subscription = await client.subscriptions.create(
            {
              amount: sub.amount,
              currency: sub.currency,
              name: sub.name,
              interval: sub.interval,
              interval_unit: sub.interval_unit,
              day_of_month: sub.day_of_month,
              links: {
                mandate: mandateID
              }
            },
            random_subscription_specific_string
          );
 
          user.gocardlessSubscription=subscription.id
          user.subscription=subscriptionID
          await user.save()
          console.log(subscription.id);
          res.redirect('/')
    } catch (e) {
        console.log(e)
    }
})

router.get('/gocardlessSubscriptionDetails',auth,async(req,res)=>{
  try { 
      const userID=req.userID
      const user=await User.findById({_id:mongoose.Types.ObjectId(userID)})
      const gocardlessSubscriptionID=user.gocardlessSubscription
      const subscriptionID=user.subscription

      const subscription = await Subscription.findById({_id:mongoose.Types.ObjectId(subscriptionID)})

      //getting from gocardless
      const subscription2 = await client.subscriptions.find(gocardlessSubscriptionID);
      console.log(`Amount: ${subscription2.amount}`);

      res.render('dashboard/subscriptionDetails',{
        subscription:subscription,
        status:subscription2.status
      })
  } catch (e) {
      console.log(e)
  }
})

router.get('/gocardlessCancelSubscription',auth,async(req,res)=>{
 
  try {
      const userID=req.userID
      const user=await User.findById({_id:mongoose.Types.ObjectId(userID)})
      const subscription=user.subscription
      const gocardlessSubscriptionID=user.gocardlessSubscription
        
      console.log("Cancelling...");
    
      const cancelSubscription = await client.subscriptions.cancel(gocardlessSubscriptionID);

      console.log(`Status: ${cancelSubscription.status}`);

        res.redirect('/gocardlessSubscriptionDetails')
    } catch (e) {
        console.log(e)
    }
})




router.get('/listAllUsers',async(req,res)=>{
  try {
    const listResponse = await client.customers.list();
    const customers = listResponse.customers;
    res.send({
      allCustomers:customers
    })
  } catch (e) {    
    console.log(e)
  }
})
  


router.get('/listSingleUser',async(req,res)=>{
  try {
    const id = 'CU000DH53FAGXN'
    const singleCustomer=await client.customers.find(id);
    res.send({
      singleCustomer:singleCustomer
    })
  } catch (e) {    
    console.log(e)
  }
})




//Note:
//mandate will be created for an account only once.you cannot create mandate for an account twice , will through an error
//you cannot take payments with same payment string twice will through an error. same goes for subscription


module.exports=router