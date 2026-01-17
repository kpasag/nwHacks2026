function Header() {
  return (
    <header style={{
      padding: '1rem 2rem',
      backgroundColor: '#1a1a1a',
      borderBottom: '1px solid #333',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>My App</h1>
      <nav>
        <a href="#" style={{ marginLeft: '1.5rem', color: '#646cff' }}>Home</a>
        <a href="#" style={{ marginLeft: '1.5rem', color: '#646cff' }}>About</a>
        <a href="#" style={{ marginLeft: '1.5rem', color: '#646cff' }}>Contact</a>
      </nav>
    </header>
  );
}

export default Header;
