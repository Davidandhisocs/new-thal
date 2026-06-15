function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    const rows = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let fields = [];
        let field = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            const nextChar = line[j + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    field += '"';
                    j++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                fields.push(field.trim());
                field = '';
            } else {
                field += char;
            }
        }
        if (field || fields.length > 0) fields.push(field.trim());
        rows.push(fields);
    }
    
    // Skip header row and parse data
    return rows.slice(1).map(r => ({
        name: r[1] || '',           // Column B: Name
        player: r[2] || '',         // Column C: Player
        levelID: r[3] || '',        // Column D: Level ID
        date: r[4] || '',           // Column E: Date
        length: Number(r[5]) || undefined, // Column F: Length
        id: '',                     // No ID column
        submitter: r[7] || '',      // Column H: Submitter
        tags: r[11]?.split(';').map(t => t.trim()).filter(Boolean) || [], // Column L: Tags (if used for notes)
        thumbnail: '',              // No thumbnail column
        video: r[8] || '',          // Column I: Player Video (main video)
        showcaseVideo: r[9] || '', // Column J: Showcase Video
    })).filter(a => a && a.name);
}
