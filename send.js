"use strict"
const amqp = require("amqplib");
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });
const uuid = require("uuid");



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

        const queue = "releaseQueue";
        const exchange = "releaseExchange";
        const bundle = process.argv[2];
        const version = process.argv[3];
        const cluster = process.argv[4];

        await channel.assertQueue(queue, {durable: true});
        await channel.assertExchange(exchange, 'topic', {
            durable:true
        });

        await channel.consume(queue, async (message) => {   
            if(message.properties.correlationId === correlationId) {
                console.log((message.content + ""));                
            }
            await channel.close();
            await connection.close();
 
        }, {noAck: true})
        
        // await channel.publish(exchange, "release.create", Buffer.from(JSON.stringify({type: "create", properties: {bundle: bundle, version: version, cluster:cluster, status:"inactive"}}))
        // );
       
        await channel.sendToQueue(queue,
            Buffer.from(JSON.stringify({type: "qa", properties: {bundle: bundle, version: version, cluster:cluster, status:"inactive"}})), {
            correlationId: correlationId,
        });
        await channel.close();
            await connection.close();
      
    }catch(err) {   
        console.error(err);
    }

})()