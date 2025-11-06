const express = require('express');
const router = express.Router();

module.exports = function(db) {

  // Get all spells
  router.get('/', (req, res) => {
    db.collection('spells_pf1e').find().sort({ name: 1 }).toArray()
      .then(spells => {
        res.json(spells);
      })
      .catch(error => {
        console.error('Failed to fetch spells:', error);
        res.status(500).json({ error: error.message });
      });
  });

  // Get a single spell by ID
  router.get('/:id', (req, res) => {
    db.collection('spells_pf1e').findOne({ _id: req.params.id })
      .then(spell => {
        if (!spell) {
          return res.status(404).json({ error: 'Spell not found' });
        }
        res.json(spell);
      })
      .catch(error => {
        console.error('Failed to fetch spell:', error);
        res.status(500).json({ error: error.message });
      });
  });

  return router;
};
