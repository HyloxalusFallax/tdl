'use strict'

const {Pool} = require('pg');
const {config} = require('./config.js')
const amqp = require('amqplib');
const reply = require('amqplib-rpc').reply;

let db = {};

db.pool = new Pool(config)

var conn, channel, pubChannel;

const getChannels = async () => {
	try {
		conn = await amqp.connect('amqp://localhost');
		channel = await conn.createChannel();
		pubChannel = await conn.createChannel();
	} catch (err) {
		console.log(err);
	}
};

async function main() {
	try {
		await getChannels();
		await channel.consume('db', processMessage, {noAck: true, exclusive: true});
	} catch (err) {
		console.log(err);
	}
};

async function processMessage(msg) {
	try {
		const data = JSON.parse(msg.content);
		var result;
		switch (data.command) {
			case 'getUser':
				console.log('retriving user');
				result = await db.getUser(data.login);
				await reply(channel, msg, {result: result});
				break;
			case 'createUser':
				console.log('creating new user');
				result = await db.createUser(data.login, data.hash);
				await reply(channel, msg, {result: result});
				break;
			case 'getProjectsOfUser':
				console.log('return projects of user');
				result = await db.getProjectsOfUser(data.username);
				await reply(channel, msg, {result: result});
				break;
			case 'createNewProject':
				console.log('creates new project');
				result = await db.createNewProject(data.login, data.projectName);
				await reply(channel, msg, {result: result});
				break;
			case 'getUsersOfTheProject':
				console.log('return users of project');
				result = await db.getUsersOfTheProject(data.projectId);
				await reply(channel, msg, {result: result});
				break;
			case 'isUserInTheProject':
				console.log('return true if user in the project');
				result = await db.isUserInTheProject(data.username, data.projectId);
				await reply(channel, msg, {result: result});
				break;
			case 'addUserToTheProject':
				console.log('add user to the project');
				result = await db.addUserToTheProject(data.username, data.projectId);
				await reply(channel, msg, {result: result});
				break;
			case 'deleteProject':
				console.log('deletes project');
				result = await db.deleteProject(data.projectId);
				await reply(channel, msg, {result: result});
				break;
			case 'deleteUserFromTheProject':
				console.log('deletes user from the project');
				result = await db.deleteUserFromTheProject(data.username, data.projectId);
				await reply(channel, msg, {result: result});
				break;
			case 'getTasksOfTheProject':
				console.log('returns task from the project');
				result = await db.getTasksOfTheProject(data.projectId);
				await reply(channel, msg, {result: result});
				break;
			case 'addTask':
				console.log('add task to the project');
				result = await db.addTask(data.taskName, data.projectId, data.currentDate, data.priority);
				await reply(channel, msg, {result: result});
				break;
			case 'isTaskInTheProject':
				console.log('returns true if task already in the project');
				result = await db.isTaskInTheProject(data.taskId, data.projectId);
				await reply(channel, msg, {result: result});
				break;
			case 'deleteTask':
				console.log('deletes task from the project');
				result = await db.deleteTask(data.taskId);
				await reply(channel, msg, {result: result});
				break;
			case 'changeTask':
				console.log('changes task');
				result = await db.changeTask(data.task);
				await reply(channel, msg, {result: result});
				break;
			case 'stop':
				console.log('closing');
				await channel.close();
				await conn.close();
				process.exit(0);
				break;
		}
	} catch (err) {
		console.log(err);
	}
}

db.getUser = async username => {
	try {
		const client = await db.pool.connect();
		try {
			const {rows} = await client.query('select * from "users" where "username" = $1', [username]);
			return (rows[0] !== undefined) ? rows[0] : null;
		} catch (err) {
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
};

db.createUser = async (login, hash) => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'insert into users ("username", "passwordHash") values ($1, $2)',
				values: [login, hash]
			}
			return await client.query(query);
		} catch (err) {
				throw err;
		} finally {
			client.release();
		}	
	} catch (err) {
		throw err;
	}				
}

db.getProjectsOfUser = async username => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'select p."projectName", p."projectId" from "usersProjects" as up inner join "users" as u on (u."username" = up."username" and u."username" = $1) inner join "projects" as p on (p."projectId" = up."projectId")',
				values: [username]
			}
			const {rows} = await client.query(query);
			return rows;
		} catch (err){
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
}

db.createNewProject = async (user, projectName) => {
	try {
		const client = await db.pool.connect();
		try {
			await client.query('BEGIN');
			let query = {
				text: 'insert into "projects" ("projectName") values ($1) returning "projectId"',
				values: [projectName]
			};
			const {rows} = await client.query(query);
			query = {
				text: 'insert into "usersProjects" ("username", "projectId") values ($1, $2)',
				values: [user, rows[0].projectId]
			};
			await client.query(query);
			await client.query('COMMIT');
		} catch (err) {
			client.query('ROLLBACK');
			throw (err);
		} finally {
			client.release();
		}		
	} catch (err) {
		console.log(err);
		throw err;
	}
}

db.isUserInTheProject = async (username, projId) => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'select * from "usersProjects" where ("username" = $1 and "projectId" = $2)',
				values: [username, projId]
			}
			const {rows} = await client.query(query);
			return (rows.length !== 0);
		} catch (err){
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
}

db.deleteProject = async (projectId) => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'delete from "projects" where "projectId" = $1',
				values: [projectId]
			};
			await client.query(query);
			return true;
		} catch (err) {
			throw(err);
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
}

db.getUsersOfTheProject = async projectId => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'select u."username" from "usersProjects" as up join "users" as u on (up."username" = u."username") join "projects" as p on (up."projectId" = p."projectId" and p."projectId" = $1)',
				values: [projectId]
			}
			const {rows} = await client.query(query);
			return rows;
		} catch (err){
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
};

db.addUserToTheProject = async (username, projectId) => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
			text: 'insert into "usersProjects" ("username", "projectId") values ($1, $2)',
			values: [username, projectId]
			}
			await client.query(query);
			return true;
		} catch (err) {
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
};

db.deleteUserFromTheProject = async(username, projectId) => {
	try {
		const client = await db.pool.connect();
		try {
			let query = {
				text: 'select * from "usersProjects" where "projectId" = $1',
				values: [projectId]
			};
			const {rows} = await client.query(query);
			try {
				await client.query('BEGIN');
				query = {
					text: 'delete from "usersProjects" where ("username" = $1 and "projectId" = $2)',
					values: [username, projectId]
				};
				await client.query(query);
				if (rows.length > 1) {
					await client.query('COMMIT');
				} else {
					query = {
						text: 'delete from "tasks" where "projectId" = $1',
						values: [projectId]
					};
					await client.query(query);
					await client.query('COMMIT');
				}
			} catch (err) {
				await client.query('ROLLBACK');
				throw (err);
			}
		} catch (err) {
			throw (err);
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
};

db.getTasksOfTheProject = async (projectId) => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'select * from tasks where ("projectId" = $1)',
				values: [projectId]
			};
			const {rows} = await client.query(query);
			return rows;
		} catch (err) {
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
};

db.addTask = async (taskName, projectId, currentDate, priority) => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'insert into "tasks" ("taskName", "projectId", "dateOfAdding", "priority", "completed") values ($1, $2, $3, $4, false) returning "taskId"',
				values: [taskName, projectId, currentDate, priority]
			};
			await client.query(query);
		} catch (err) {
			throw (err);
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
}

db.deleteTask = async (taskId) => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'delete from "tasks" where ("taskId" = $1)',
				values: [taskId]
			};
			await client.query(query);
		} catch (err) {
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
}

db.isTaskInTheProject = async (taskId, projectId) => {
	try {
		const client = await db.pool.connect();
		try {
			const query = {
				text: 'select * from "tasks" where ("taskId" = $1 and "projectId" = $2)',
				values: [taskId, projectId]
			}
			const {rows} = await client.query(query);
			return (rows.length !== 0);
		} catch (err){
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
}

db.changeTask = async (task) => {
	try {
		const client = await db.pool.connect();
		try {
			let query = {
				text: 'select * from "tasks" where ("taskId" = $1)',
				values: [task.taskId]
			};
			const {rows} = await client.query(query);
			const taskName = (task.taskName !== undefined) ? task.taskName : rows[0].taskName;
			const priority = (task.priority !== undefined) ? task.priority : rows[0].priority;
			const completed = (task.completed !== undefined) ? task.completed : rows[0].completed;
			query = {
				text: 'update "tasks" set "taskName" = $1, "priority" = $2, "completed" = $3 where ("taskId" = $4)',
				values: [taskName, priority, completed, task.taskId]
			};
			await client.query(query);
			return true;
		} catch (err) {
			throw err;
		} finally {
			client.release();
		}
	} catch (err) {
		console.log(err);
		throw err;
	}
}

main();

module.exports = db;