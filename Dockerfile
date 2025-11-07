# Stage 1: Build the Angular application
FROM node:20 AS build
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install all dependencies (including devDependencies for the build)
# Added --legacy-peer-deps to fix ERESOLVE conflicts
RUN npm install --legacy-peer-deps

# Copy the rest of the application source code
COPY . .

# Build the Angular application for production
RUN npm run build -- --configuration production --base-href /codex/

# Stage 2: Create the final, lightweight production image
FROM node:20-alpine
WORKDIR /app

# Set the environment to production
ENV NODE_ENV=production

# Copy only the production package files
COPY package*.json ./

# Install ONLY production dependencies
# Added --legacy-peer-deps to fix ERESOLVE conflicts
RUN npm install --legacy-peer-deps

# Copy the built Angular app from the 'build' stage
COPY --from=build /app/dist/codex-admin/browser ./public

# Copy the server code AND the routes directory
COPY server.js .
COPY routes ./routes

# Expose the port the server will run on
EXPOSE 8080

# The command to start the Node.js server
CMD [ "node", "server.js" ]