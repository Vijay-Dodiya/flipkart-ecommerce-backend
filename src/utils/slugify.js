const slugify = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")        // spaces → -
        .replace(/[^\w-]+/g, "")     // remove special characters
        .replace(/--+/g, "-");       // multiple - → single -
};

export default slugify;