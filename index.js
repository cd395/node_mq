"use strict"
//  is it mehello
const amqp = require("amqplib");
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });
async function queryDb({ properties, type })
{


    const mysql = require("mysql2");
    const connection = mysql.createPool({

        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,

    })

    // connection.connect();
    const poolPromise = connection.promise();
    if (type === "create")
    {
        const [rows, fields] = await poolPromise.query("INSERT INTO releases (bundle, version, status, cluster) VALUES (?, ?, ?,?)", [properties.bundle, properties.version, properties.status, properties.cluster]);
        console.log(rows);
        return rows;
    }
    connection.end();
}

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

(async () =>
{
    try
    {
        const connection = await amqp.connect({
            hostname: process.env.RABBIT_HOST_NAME,
            port: process.env.RABBIT_PORT,
            username: process.env.RABBIT_USERNAME,
            password: process.env.RABBIT_PASSWORD,
            vhost: process.env.RABBIT_VHOST,

        });
        const channel = await connection.createChannel();
        let queue = "releaseQueue";
        const exchange = "releaseExchange";
        process.once('SIGINT', async () =>
        {
            await channel.close();
            await connection.close();
        })
        await channel.prefetch(1);

        await channel.assertQueue(queue, { durable: true });
        await channel.assertExchange(exchange, 'topic', {
            durable: true
        })
        await channel.bindQueue(queue, exchange, "release.create");
        await channel.consume(queue, async (message) =>
        {
            const request = JSON.parse(message.content)
            try
            {
                await queryDb({
                    properties: request.properties,
                    type: request.type
                });
                const { properties } = request;
                console.log(properties);
                const bundlePrefix = getBundlePrefix(properties.bundle);
                const message = { cluster: properties.cluster, version: properties.version, bundle: getBundlePrefix(properties.bundle) };
                queue = `releaseQueue-${getBundlePrefix(properties.bundle)}-${properties.cluster}`;
                await channel.bindQueue(queue, exchange, `${bundlePrefix}.${properties.cluster}`);
                console.log(queue);
                await channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
                // channel.publish(exchange, "release.publish", Buffer.from("success"), { correlationId: message.properties.correlationId });
            } catch (e)
            {
                console.log(e);
                channel.publish(exchange, "release.error", Buffer.from("Something went wrong.."), { correlationId: message.properties.correlationId })
            }
            channel.ack(message);
        });

        console.log("[*] Waiting for messages... To exit press CTRL + C");

    } catch (err)
    {
        console.warn(err);
    }
})()
