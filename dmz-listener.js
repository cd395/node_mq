"use strict"

const amqp = require("amqplib");
const dotenv = require('dotenv');
const { exec } = require("child_process");
dotenv.config({ path: "./.env" });

(async () => {

    try {
        const connection = await amqp.connect({
            hostname: "10.147.18.10",
            port: "5672",
            username: "test",
            password: "test",
            vhost: "testHost",

        });

        const channel = await connection.createChannel();

        process.once("SIGINT", async () => {
            await channel.close();
            await connection.close();
        });

        const queue = "releaseQueue-dmz-qa";
        const exchange = "releaseExchange";
        const routingKey = "dmz.qa";

        await channel.prefetch(1);

        await channel.assertQueue(queue, { durable: true });
        await channel.assertExchange(exchange, "topic", { durable: true });

        await channel.bindQueue(queue, exchange, routingKey);

        await channel.consume(queue, async (message) => {
            console.log(message.content + "");
            const props = JSON.parse(message.content + "");
            //console.log(props);
            const command = `/home/dmz-qa/getRelease.sh frontend ${props.version}`;
            console.log(command);
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(error)
                    return;
                }
                console.log(stdout);
                console.log(stderr);
            });

            //  const response = { cluster: props.cluster, version: props.version, bundle: "frontend" };
            // channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(response)), { correlationId: message.properties.correlationId });
            await channel.ack(message);
        });


        console.log("[*] Waiting for messages");



    } catch (e) { console.error(e) }
})()
