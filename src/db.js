const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/db.json');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Initialize db file if it doesn't exist
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({
    users: [],
    projects: [],
    projectMembers: [],
    tasks: []
  }), 'utf8');
}

// Helper functions to read/write JSON
const readDB = () => {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { users: [], projects: [], projectMembers: [], tasks: [] };
  }
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
};

// Helper functions
const DB = {
  // ─── USERS ───────────────────────────────────────────────
  createUser({ name, email, passwordHash }) {
    const data = readDB();
    const user = { id: uuidv4(), name, email, passwordHash, createdAt: new Date().toISOString() };
    data.users.push(user);
    writeDB(data);
    return user;
  },
  findUserByEmail(email) {
    const data = readDB();
    return data.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },
  findUserById(id) {
    const data = readDB();
    return data.users.find(u => u.id === id) || null;
  },
  getAllUsers() {
    const data = readDB();
    return data.users.map(u => ({ id: u.id, name: u.name, email: u.email }));
  },

  // ─── PROJECTS ────────────────────────────────────────────
  createProject({ name, description, adminId }) {
    const data = readDB();
    const project = { id: uuidv4(), name, description, adminId, createdAt: new Date().toISOString() };
    data.projects.push(project);
    // Admin is also a member
    data.projectMembers.push({ id: uuidv4(), projectId: project.id, userId: adminId, role: 'admin' });
    writeDB(data);
    return project;
  },
  findProjectById(id) {
    const data = readDB();
    return data.projects.find(p => p.id === id) || null;
  },
  getProjectsForUser(userId) {
    const data = readDB();
    const memberProjectIds = data.projectMembers.filter(m => m.userId === userId).map(m => m.projectId);
    return data.projects.filter(p => memberProjectIds.includes(p.id));
  },
  getAllProjects() {
    const data = readDB();
    return data.projects;
  },
  deleteProject(id) {
    const data = readDB();
    data.projects = data.projects.filter(p => p.id !== id);
    data.projectMembers = data.projectMembers.filter(m => m.projectId !== id);
    data.tasks = data.tasks.filter(t => t.projectId !== id);
    writeDB(data);
  },

  // ─── PROJECT MEMBERS ─────────────────────────────────────
  addMember({ projectId, userId, role = 'member' }) {
    const data = readDB();
    const exists = data.projectMembers.find(m => m.projectId === projectId && m.userId === userId);
    if (exists) return exists;
    const m = { id: uuidv4(), projectId, userId, role };
    data.projectMembers.push(m);
    writeDB(data);
    return m;
  },
  removeMember({ projectId, userId }) {
    const data = readDB();
    data.projectMembers = data.projectMembers.filter(
      m => !(m.projectId === projectId && m.userId === userId)
    );
    writeDB(data);
  },
  getMembersOfProject(projectId) {
    const data = readDB();
    return data.projectMembers
      .filter(m => m.projectId === projectId)
      .map(m => {
        const user = data.users.find(u => u.id === m.userId);
        return user ? { id: user.id, name: user.name, email: user.email, role: m.role } : null;
      })
      .filter(Boolean);
  },
  getMemberRole(projectId, userId) {
    const data = readDB();
    const m = data.projectMembers.find(m => m.projectId === projectId && m.userId === userId);
    return m ? m.role : null;
  },

  // ─── TASKS ───────────────────────────────────────────────
  createTask({ projectId, title, description, dueDate, priority, assigneeId, createdBy }) {
    const data = readDB();
    const task = {
      id: uuidv4(), projectId, title, description,
      dueDate: dueDate || null, priority: priority || 'medium',
      status: 'todo', assigneeId: assigneeId || null, createdBy,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.tasks.push(task);
    writeDB(data);
    return task;
  },
  findTaskById(id) {
    const data = readDB();
    return data.tasks.find(t => t.id === id) || null;
  },
  getTasksForProject(projectId) {
    const data = readDB();
    return data.tasks.filter(t => t.projectId === projectId);
  },
  getTasksForUser(userId) {
    const data = readDB();
    return data.tasks.filter(t => t.assigneeId === userId);
  },
  updateTask(id, updates) {
    const data = readDB();
    const idx = data.tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    data.tasks[idx] = { ...data.tasks[idx], ...updates, updatedAt: new Date().toISOString() };
    writeDB(data);
    return data.tasks[idx];
  },
  deleteTask(id) {
    const data = readDB();
    data.tasks = data.tasks.filter(t => t.id !== id);
    writeDB(data);
  },
  getAllTasks() {
    const data = readDB();
    return data.tasks;
  },

  // ─── DASHBOARD ───────────────────────────────────────────
  getDashboardStats(userId, isAdmin) {
    const data = readDB();
    let tasks;
    if (isAdmin) {
      tasks = data.tasks;
    } else {
      const myProjectIds = data.projectMembers.filter(m => m.userId === userId).map(m => m.projectId);
      tasks = data.tasks.filter(t => myProjectIds.includes(t.projectId));
    }

    const now = new Date();
    const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done');
    const byStatus = {
      todo: tasks.filter(t => t.status === 'todo').length,
      inprogress: tasks.filter(t => t.status === 'inprogress').length,
      done: tasks.filter(t => t.status === 'done').length,
    };

    // Tasks per user (top 5)
    const perUser = {};
    tasks.forEach(t => {
      if (t.assigneeId) {
        perUser[t.assigneeId] = (perUser[t.assigneeId] || 0) + 1;
      }
    });
    const tasksPerUser = Object.entries(perUser).map(([uid, count]) => {
      const user = data.users.find(u => u.id === uid);
      return { userId: uid, name: user?.name || 'Unknown', count };
    }).sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      total: tasks.length,
      byStatus,
      overdue: overdue.length,
      tasksPerUser,
      recentTasks: tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5)
    };
  }
};

module.exports = DB;
