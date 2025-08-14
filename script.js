// Okha.ai Website JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileMenu = document.querySelector('.mobile-menu');
    const navLinks = document.querySelector('.nav-links');
    const body = document.body;
    
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.classList.add('nav-overlay');
    body.appendChild(overlay);
    
    if (mobileMenu && navLinks) {
        // Toggle mobile menu with touch support
        function handleMenuToggle(e) {
            e.preventDefault();
            e.stopPropagation();
            const isActive = navLinks.classList.contains('active');
            
            if (isActive) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        }
        
        mobileMenu.addEventListener('click', handleMenuToggle);
        mobileMenu.addEventListener('touchend', handleMenuToggle);
        
        // Open mobile menu function
        function openMobileMenu() {
            navLinks.classList.add('active');
            overlay.classList.add('active');
            mobileMenu.classList.add('active');
            mobileMenu.setAttribute('aria-expanded', 'true');
            body.style.overflow = 'hidden'; // Prevent background scrolling
        }
        
        // Close mobile menu function
        function closeMobileMenu() {
            navLinks.classList.remove('active');
            overlay.classList.remove('active');
            mobileMenu.classList.remove('active');
            mobileMenu.setAttribute('aria-expanded', 'false');
            body.style.overflow = ''; // Restore scrolling
        }
        
        // Close mobile menu when clicking/touching on links
        const navMenuLinks = navLinks.querySelectorAll('a');
        navMenuLinks.forEach(link => {
            function handleLinkClick(e) {
                // Add small delay for better touch feedback
                setTimeout(() => {
                    closeMobileMenu();
                }, 100);
            }
            
            link.addEventListener('click', handleLinkClick);
            link.addEventListener('touchend', function(e) {
                e.preventDefault();
                // Simulate click after touch for proper navigation
                setTimeout(() => {
                    link.click();
                }, 50);
            });
        });
        
        // Close mobile menu when clicking overlay
        overlay.addEventListener('click', function() {
            closeMobileMenu();
        });
        
        // Close mobile menu on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && navLinks.classList.contains('active')) {
                closeMobileMenu();
            }
        });
        
        // Close mobile menu on window resize (if screen gets bigger)
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                closeMobileMenu();
            }
        });
    }

    // Header scroll effect
    const header = document.querySelector('header');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            }
        });
    }, observerOptions);

    // Add animation classes to elements
    document.querySelectorAll('.feature-card, .testimonial, .pricing-card').forEach(el => {
        el.classList.add('animate-on-scroll');
        observer.observe(el);
    });

    // Form handling
    const auditForm = document.getElementById('auditForm');
    if (auditForm) {
        auditForm.addEventListener('submit', handleFormSubmit);
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Form validation
    const formInputs = document.querySelectorAll('input[required], select[required], textarea[required]');
    formInputs.forEach(input => {
        input.addEventListener('blur', validateField);
        input.addEventListener('input', clearErrors);
    });
});

function handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Show loading state
    showLoading();
    
    // Validate form
    if (!validateForm(form)) {
        hideLoading();
        showError('Please fill in all required fields correctly.');
        return;
    }
    
    // Convert FormData to object
    const data = {};
    formData.forEach((value, key) => {
        data[key] = value;
    });
    
    // Add timestamp
    data.timestamp = new Date().toISOString();
    data.userAgent = navigator.userAgent;
    data.referrer = document.referrer;
    
    // Simulate API call (replace with actual endpoint)
    submitAuditRequest(data)
        .then(response => {
            hideLoading();
            if (response.success) {
                // Redirect to thank you page
                window.location.href = 'thank-you.html?submitted=true';
            } else {
                showError('There was an issue submitting your request. Please try again.');
            }
        })
        .catch(error => {
            hideLoading();
            console.error('Form submission error:', error);
            showError('There was an issue submitting your request. Please try again.');
        });
}

function validateForm(form) {
    let isValid = true;
    const requiredFields = form.querySelectorAll('input[required], select[required], textarea[required]');
    
    requiredFields.forEach(field => {
        if (!validateField({ target: field })) {
            isValid = false;
        }
    });
    
    // Additional validations
    const email = form.querySelector('input[type="email"]');
    if (email && email.value && !isValidEmail(email.value)) {
        showFieldError(email, 'Please enter a valid email address.');
        isValid = false;
    }
    
    const website = form.querySelector('input[name="website"]');
    if (website && website.value && !isValidWebsite(website.value)) {
        showFieldError(website, 'Please enter a valid website URL.');
        isValid = false;
    }
    
    return isValid;
}

function validateField(e) {
    const field = e.target;
    const value = field.value.trim();
    
    // Clear previous errors
    clearFieldError(field);
    
    if (field.hasAttribute('required') && !value) {
        showFieldError(field, 'This field is required.');
        return false;
    }
    
    if (field.type === 'email' && value && !isValidEmail(value)) {
        showFieldError(field, 'Please enter a valid email address.');
        return false;
    }
    
    if (field.name === 'website' && value && !isValidWebsite(value)) {
        showFieldError(field, 'Please enter a valid website URL.');
        return false;
    }
    
    return true;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidWebsite(website) {
    try {
        // Add protocol if missing
        let url = website;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function showFieldError(field, message) {
    clearFieldError(field);
    
    field.classList.add('error');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;
    errorDiv.style.color = '#e74c3c';
    errorDiv.style.fontSize = '0.9rem';
    errorDiv.style.marginTop = '0.25rem';
    
    field.parentNode.appendChild(errorDiv);
}

function clearFieldError(field) {
    field.classList.remove('error');
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
}

function clearErrors(e) {
    clearFieldError(e.target);
    hideError();
}

function showLoading() {
    const loading = document.querySelector('.loading');
    const submitBtn = document.querySelector('button[type="submit"]');
    
    if (loading) {
        loading.style.display = 'block';
    }
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner"></div> Submitting...';
    }
}

function hideLoading() {
    const loading = document.querySelector('.loading');
    const submitBtn = document.querySelector('button[type="submit"]');
    
    if (loading) {
        loading.style.display = 'none';
    }
    
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Get My Free Website Audit';
    }
}

function showError(message) {
    const errorDiv = document.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

function hideError() {
    const errorDiv = document.querySelector('.error-message');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

function showSuccess(message) {
    const successDiv = document.querySelector('.success-message');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        successDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

// Submit audit request to Vercel Function
async function submitAuditRequest(data) {
    try {
        const response = await fetch('/api/submit-audit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Submission failed');
        }

        // Track successful submission
        trackEvent('audit_submitted', {
            business_type: data.businessType,
            main_goal: data.mainGoal,
            lead_id: result.leadId
        });

        return result;

    } catch (error) {
        console.error('Audit submission error:', error);
        
        // Track failed submission
        trackEvent('audit_submission_failed', {
            error: error.message,
            business_type: data.businessType
        });

        throw error;
    }
}

// Enhanced Analytics and tracking functions
function trackEvent(eventName, properties = {}) {
    // Vercel Analytics tracking
    if (window.va && typeof window.va.track === 'function') {
        window.va.track(eventName, properties);
    }
    
    // Google Analytics 4 tracking with enhanced parameters
    if (typeof gtag !== 'undefined') {
        // Map custom events to GA4 recommended events
        switch(eventName) {
            case 'form_started':
                if (typeof trackAuditFormStart === 'function') {
                    trackAuditFormStart();
                }
                break;
            case 'form_submitted':
                if (typeof trackAuditFormSubmit === 'function') {
                    trackAuditFormSubmit(properties.business_type, properties.lead_value);
                }
                break;
            case 'audit_completed':
                if (typeof trackAuditComplete === 'function') {
                    trackAuditComplete(properties.audit_score, properties.business_type);
                }
                break;
            case 'email_sent':
                if (typeof trackEmailSent === 'function') {
                    trackEmailSent(properties.lead_id, properties.business_type);
                }
                break;
            default:
                gtag('event', eventName, properties);
        }
    }
    
    // Console log for debugging
    console.log('Event tracked:', eventName, properties);
}

// Enhanced form tracking with Google Analytics
function trackFormInteraction(action, elementType = '', value = '') {
    trackEvent('form_interaction', {
        'interaction_type': action,
        'element_type': elementType,
        'form_value': value,
        'timestamp': Date.now()
    });
}

// Track scroll depth for engagement
function trackScrollDepth() {
    let maxScroll = 0;
    let scrollTimer;
    
    window.addEventListener('scroll', function() {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
            const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
            
            if (scrollPercent > maxScroll) {
                maxScroll = scrollPercent;
                
                // Track milestone scroll depths
                if (scrollPercent >= 25 && maxScroll < 25) {
                    trackEvent('scroll_depth', { 'percent': 25 });
                } else if (scrollPercent >= 50 && maxScroll < 50) {
                    trackEvent('scroll_depth', { 'percent': 50 });
                } else if (scrollPercent >= 75 && maxScroll < 75) {
                    trackEvent('scroll_depth', { 'percent': 75 });
                } else if (scrollPercent >= 90 && maxScroll < 90) {
                    trackEvent('scroll_depth', { 'percent': 90 });
                }
            }
        }, 250);
    });
}

// Track time on page
function trackTimeOnPage() {
    let startTime = Date.now();
    let tracked30s = false;
    let tracked60s = false;
    let tracked180s = false;
    
    setInterval(function() {
        const timeOnPage = Date.now() - startTime;
        
        if (timeOnPage >= 30000 && !tracked30s) {
            trackEvent('time_on_page', { 'seconds': 30 });
            tracked30s = true;
        } else if (timeOnPage >= 60000 && !tracked60s) {
            trackEvent('time_on_page', { 'seconds': 60 });
            tracked60s = true;
        } else if (timeOnPage >= 180000 && !tracked180s) {
            trackEvent('time_on_page', { 'seconds': 180 });
            tracked180s = true;
        }
    }, 5000);
}

// Enhanced form and page tracking
document.addEventListener('DOMContentLoaded', function() {
    // Initialize enhanced tracking
    trackScrollDepth();
    trackTimeOnPage();
    
    // Track form interactions with detailed analytics
    const auditForm = document.getElementById('auditForm');
    if (auditForm) {
        let formStarted = false;
        let formData = {};
        
        // Track form start
        auditForm.addEventListener('input', function(e) {
            if (!formStarted) {
                trackEvent('form_started', {
                    form_name: 'website_audit',
                    first_field: e.target.name || e.target.id
                });
                formStarted = true;
            }
            
            // Track individual field interactions
            trackFormInteraction('field_focus', e.target.type, e.target.name);
        });
        
        // Track form field completion
        auditForm.addEventListener('change', function(e) {
            if (e.target.value && e.target.value.trim() !== '') {
                formData[e.target.name] = e.target.value;
                trackFormInteraction('field_completed', e.target.type, e.target.name);
            }
        });
        
        // Track form submission with business intelligence
        auditForm.addEventListener('submit', function(e) {
            const businessType = formData.businessType || 'unknown';
            const leadValue = calculateLeadValue(businessType);
            
            trackEvent('form_submitted', {
                form_name: 'website_audit',
                business_type: businessType,
                lead_value: leadValue,
                fields_completed: Object.keys(formData).length
            });
        });
    }
    
    // Track page views with enhanced data
    trackEvent('page_view', {
        page_title: document.title,
        page_path: window.location.pathname,
        page_location: window.location.href,
        referrer: document.referrer
    });
    
    // Track CTA button clicks with position tracking
    document.querySelectorAll('.btn').forEach((button, index) => {
        button.addEventListener('click', function() {
            trackEvent('cta_click', {
                button_text: this.textContent.trim(),
                button_url: this.href || null,
                button_position: index + 1,
                section: getButtonSection(this)
            });
        });
    });
    
    // Track scroll to form
    const formSection = document.querySelector('#audit-form');
    if (formSection) {
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    trackEvent('form_viewed', {
                        form_name: 'website_audit',
                        scroll_depth: Math.round((window.scrollY / document.body.scrollHeight) * 100)
                    });
                    observer.unobserve(entry.target); // Only track once
                }
            });
        }, { threshold: 0.5 });
        
        observer.observe(formSection);
    }
});

// Helper functions for analytics
function calculateLeadValue(businessType) {
    const leadValues = {
        'restaurant': 2000,
        'healthcare': 5000,
        'professional-services': 3500,
        'home-services': 3000,
        'automotive': 2500,
        'retail': 1500,
        'other': 2497
    };
    return leadValues[businessType] || leadValues['other'];
}

function getButtonSection(button) {
    const section = button.closest('section');
    if (section) {
        return section.className || section.id || 'unknown';
    }
    return 'header';
}

// Utility functions
function formatWebsiteUrl(url) {
    if (!url) return '';
    
    // Add https:// if no protocol is specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
    return url;
}

function sanitizeInput(input) {
    // Basic HTML sanitization
    return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<[^>]*>/g, '')
                .trim();
}

// Handle URL parameters on thank you page
if (window.location.pathname.includes('thank-you.html')) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('submitted') === 'true') {
        // Show success animation or message
        document.addEventListener('DOMContentLoaded', function() {
            const successSection = document.querySelector('.success-section');
            if (successSection) {
                successSection.style.animation = 'fadeIn 1s ease-in';
            }
        });
    }
}