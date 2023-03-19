"use strict"
const amqp = require("amqplib");
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });
async function queryDb({properties,type}) {


    const mysql = require("mysql2");
    const connection = mysql.createPool({
    
        host: process.env.DB_HOST,
        user:process.env.DB_USER,
        password:process.env.DB_PASSWORD,
        database:process.env.DB_DATABASE,
    
    })
    
    // connection.connect();
    const poolPromise = connection.promise();
    if(type === "login") {
        const [rows, fields] = await poolPromise.query("SELECT * FROM users where `username` = ? AND `user_pass` = ? LIMIT 1", [properties.username, properties.password]);
        console.log(rows);
        return rows;
    }
   
    connection.end();
    
    
    
    
    }
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

        process.once('SIGINT', async() => {
            await channel.close();
            await connection.close();
        })
        await channel.prefetch(1);

        await channel.assertQueue(queue, {durable: true});
        await channel.assertExchange("mainExchange", 'topic', {
            durable:true
        })
        await channel.bindQueue(queue, "mainExchange", "main.db");
        await channel.consume(queue,  async (message) => {
            const request = JSON.parse(message.content)
           const results = await queryDb({
            properties: request.properties,
            type:request.type
           })

           channel.publish("mainExchange","main.db" ,Buffer.from(JSON.stringify(results ?? "")), {
            correlationId: message.properties.correlationId
           });
             channel.ack(message);
        });

        console.log("[*] Waiting for messages... To exit press CTRL + C");

    }catch(err) {   
        console.warn(err);
    }
})()