import winston from "winston";

const isDev = process.env.NODE_ENV !== "production";

export const logger = winston.createLogger({
    level: isDev ? "debug" : "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
    ),
    transports: isDev
        ? [
              new winston.transports.Console({
                  format: winston.format.combine(
                      winston.format.colorize(),
                      winston.format.printf(
                          ({ timestamp, level, message, ...meta }) => {
                              const metaStr = Object.keys(meta).length
                                  ? ` ${JSON.stringify(meta)}`
                                  : "";
                              return `${timestamp} [${level}]: ${message}${metaStr}`;
                          },
                      ),
                  ),
              }),
          ]
        : [
              new winston.transports.Console({
                  format: winston.format.json(),
              }),
          ],
});
