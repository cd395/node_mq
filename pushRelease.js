"use strict"
const amqp = require("amqplib");
const dotenv = require('dotenv');
const uuid = require("uuid");

dotenv.config({ path: './.env' });

// Sample command
// node pushRelease.js fe prod 1.0.1

const bundle = process.argv[2]
const cluster = process.argv[3];
const version = process.argv[4];
console.log(cluster);
console.log(version);

if (!cluster) { return "cluster argument is required (e.g. prod/qa)" };
if (!version) { return "version argument is required (e.g. 1.0.0)" };

function getBundlePrefix(bundleName)
{

    switch (bundleName.toLowerCase())
    {
        case "frontend":
            return "fe";
        case "backend":
            return "be";
        default:
            return bundleName.toLowerCase();
    }
}

async function queryDb({ properties, type }) {
    console.log("props: " + JSON.stringify(properties));
    console.log("type " + type);
    const mysql = require("mysql2");
    const connection = mysql.createPool({
   hostname: "10.147.18.10",
            port: "5672",
            username: "test",
            password: "test",
            vhost: "testHost",
    });
    const poolPromise = connection.promise();
    console.log(type === "push");
    if (type === "push") {
        console.log("nice");
        const _ = await poolPromise.query("UPDATE releases SET status='inactive' WHERE bundle=? AND cluster=?", [properties.bundle, properties.cluster]);
        const [rows, fields] = await poolPromise.query("UPDATE releases SET status = 'active' WHERE version=? AND bundle=?", [properties.version, properties.bundle]);
        console.log(rows);

        console.log("jello")
    } else {
        const [rows, fields] = await poolPromise.query("UPDATE releases SET status = 'inactive' WHERE version=? ", [properties.version])
    }
    connection.end();
}


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
        const bundleName = getBundlePrefix(bundle);
        const queue = `releaseQueue-${bundleName}-${cluster}`;
        const exchange = "releaseExchange";
        process.once('SIGINT', async () => {
            await channel.close();
            await connection.close();
        })

        const type = process.argv[5];
        const correlationId = uuid.v4();
        const routingKey = `${bundle}.${cluster}`;

        await channel.assertQueue(queue, { durable: true });
        await channel.assertExchange(exchange, "topic", { durable: true });
        await channel.bindQueue(queue, exchange, routingKey);
        await channel.consume(queue, async (message) => {
            const contents = JSON.parse(message.content + "");
            if (correlationId === message.properties.correlationId) {
                console.log(contents);
                if (contents.hasOwnProperty("bundle")) {
                    await queryDb({ properties: contents, type: type });
                }

            }

            //await queryDb({properties: contents})
            await channel.close();
            await connection.close();
        }, { noAck: true });

        const message = { cluster, version };
        await channel.publish(exchange,routingKey, Buffer.from(JSON.stringify(message)), { correlationId: correlationId, replyTo: queue })
    } catch (err) {
        console.warn(err);
    }
})()
