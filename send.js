"use strict"
const amqp = require("amqplib");
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });
const uuid = require("uuid");

const queue = "dbQueue";

(async () => {
    try {
        const connection = await amqp.connect({
            hostname: process.env.RABBIT_HOST_NAME,
            port: process.env.RABBIT_PORT,
            username: process.env.RABBIT_USERNAME,
            password: process.env.RABBIT_PASSWORD,
            vhost: process.env.RABBIT_VHOST,
            
        });
        const channel = await connection.createChannel();
        const correlationId = uuid.v4();

        process.once('SIGINT', async() => {
            await channel.close();
            await connection.close();
        })

        await channel.assertQueue(queue, {durable: true});
        await channel.assertExchange("mainExchange", 'topic', {
            durable:true
        });
        // await channel.bindQueue(queue, "mainExchange");


        await channel.consume(queue, async (message) => {   
            if(message.properties.correlationId === correlationId) {
                console.log(JSON.parse(message.content))
          
            }
            await channel.close();
            await connection.close();
 
        }, {noAck: true})


        await channel.sendToQueue("dbQueue",
        Buffer.from(JSON.stringify({type: "login", properties: {username: "it490", password: "root"}})), {
            correlationId: correlationId,
            replyTo: queue,         
        });
      
    }catch(err) {   
        console.warn(err);
    }

})()